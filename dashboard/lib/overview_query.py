#!/usr/bin/env python3
"""Compute dashboard overview metrics from MongoDB."""

from __future__ import annotations

import argparse
import json
import math
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from pymongo import MongoClient

ENDPOINT_FAMILY_CODING_PLAN = "coding_plan"
ENDPOINT_FAMILY_OFFICIAL_API = "official_api"
ENDPOINT_FAMILIES = (ENDPOINT_FAMILY_CODING_PLAN, ENDPOINT_FAMILY_OFFICIAL_API)
MIN_STABLE_GENERATION_WINDOW_MS = 500.0
MAX_REASONABLE_TPS = 1000.0


def _percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (len(ordered) - 1) * p
    lower = math.floor(rank)
    upper = math.ceil(rank)
    if lower == upper:
        return ordered[int(rank)]
    weight = rank - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def _to_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _next_thirty_mark(now: datetime) -> datetime:
    now = now.astimezone(timezone.utc)
    if now.minute < 30:
        return now.replace(minute=30, second=0, microsecond=0)
    return (now + timedelta(hours=1)).replace(minute=30, second=0, microsecond=0)


def _normalize_endpoint_family(raw: str) -> str:
    normalized = raw.strip().lower().replace("-", "_")
    if normalized in ENDPOINT_FAMILIES:
        return normalized
    raise ValueError(f"endpoint family must be one of: {', '.join(ENDPOINT_FAMILIES)}")


def _build_endpoint_family_match(endpoint_family: str) -> dict[str, Any]:
    if endpoint_family == ENDPOINT_FAMILY_CODING_PLAN:
        return {
            "$or": [
                {"endpoint_family": ENDPOINT_FAMILY_CODING_PLAN},
                {
                    "$and": [
                        {"endpoint_family": {"$exists": False}},
                        {"endpoint_base": {"$regex": r"/api/coding/paas/v4/?$", "$options": "i"}},
                    ]
                },
            ]
        }

    return {
        "$or": [
            {"endpoint_family": ENDPOINT_FAMILY_OFFICIAL_API},
            {
                "$and": [
                    {"endpoint_family": {"$exists": False}},
                    {"endpoint_base": {"$regex": r"/api/paas/v4/?$", "$options": "i"}},
                ]
            },
        ]
    }


def _extract_stable_tps(doc: dict[str, Any], key: str) -> float | None:
    metrics = doc.get("metrics", {})
    if not isinstance(metrics, dict):
        return None

    raw_value = metrics.get(key)
    raw_generation_window_ms = metrics.get("generation_window_ms")
    if raw_value is None or raw_generation_window_ms is None:
        return None

    try:
        generation_window_ms = float(raw_generation_window_ms)
    except (TypeError, ValueError):
        return None
    if generation_window_ms < MIN_STABLE_GENERATION_WINDOW_MS:
        return None

    try:
        value = float(raw_value)
    except (TypeError, ValueError):
        return None
    if value < 0 or value > MAX_REASONABLE_TPS:
        return None
    return value


def _extract_output_tps_post_ttft(doc: dict[str, Any]) -> float | None:
    metrics = doc.get("metrics", {})
    if not isinstance(metrics, dict):
        return None

    raw_stored = metrics.get("output_tokens_per_second_post_ttft")
    if raw_stored is not None:
        try:
            stored_value = float(raw_stored)
        except (TypeError, ValueError):
            stored_value = None
        if stored_value is not None and stored_value >= 0:
            return stored_value

    tokens = doc.get("tokens", {})
    if not isinstance(tokens, dict):
        return None

    raw_completion_tokens = tokens.get("completion_tokens")
    raw_total_latency_ms = metrics.get("total_latency_ms")
    raw_ttft_ms = metrics.get("ttft_ms")
    if raw_completion_tokens is None or raw_total_latency_ms is None or raw_ttft_ms is None:
        return None

    try:
        completion_tokens = float(raw_completion_tokens)
        total_latency_ms = float(raw_total_latency_ms)
        ttft_ms = float(raw_ttft_ms)
    except (TypeError, ValueError):
        return None

    if completion_tokens <= 1 or total_latency_ms <= ttft_ms:
        return None

    return (completion_tokens - 1) / ((total_latency_ms - ttft_ms) / 1000)


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _collect_metric_values(docs: list[dict[str, Any]], key: str) -> list[float]:
    values: list[float] = []
    for doc in docs:
        raw = _as_dict(doc.get("metrics")).get(key)
        if raw is None:
            continue
        try:
            values.append(float(raw))
        except (TypeError, ValueError):
            continue
    return values


def _collect_metric_gap_values(docs: list[dict[str, Any]], left_key: str, right_key: str) -> list[float]:
    values: list[float] = []
    for doc in docs:
        metrics = _as_dict(doc.get("metrics"))
        left_raw = metrics.get(left_key)
        right_raw = metrics.get(right_key)
        if left_raw is None or right_raw is None:
            continue
        try:
            values.append(float(left_raw) - float(right_raw))
        except (TypeError, ValueError):
            continue
    return values


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hours", type=float, default=24.0)
    parser.add_argument("--model", default="")
    parser.add_argument("--endpoint-family", default=ENDPOINT_FAMILY_CODING_PLAN)
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    try:
        endpoint_family = _normalize_endpoint_family(args.endpoint_family)
    except ValueError as exc:
        print(json.dumps({"error": str(exc)}))
        return 2

    mongodb_uri = os.getenv("MONGODB_URI")
    if not mongodb_uri:
        print(json.dumps({"error": "MONGODB_URI is required"}))
        return 2

    db_name = os.getenv("MONGO_DB", "zaimonitor")
    collection_name = os.getenv("MONGO_COLLECTION", "inference_runs")

    requested_hours = max(args.hours, 24.0)
    scope_days = max(1, math.ceil(requested_hours / 24.0))
    now_utc = datetime.now(timezone.utc)
    current_midnight_utc = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    metrics_window_start = now_utc - timedelta(hours=24)
    metrics_window_end = now_utc

    client = MongoClient(mongodb_uri, serverSelectionTimeoutMS=10000)
    collection = client[db_name][collection_name]

    scope_filter = _build_endpoint_family_match(endpoint_family)
    trend_scope_filter: dict[str, Any] = {**scope_filter}
    if args.model:
        trend_scope_filter["model"] = args.model

    latest_trend_doc = next(
        iter(
            collection.find(
                trend_scope_filter,
                projection={"_id": 0, "timestamp": 1},
            )
            .sort("timestamp", -1)
            .limit(1)
        ),
        None,
    )
    latest_trend_timestamp = (
        latest_trend_doc.get("timestamp")
        if isinstance(latest_trend_doc, dict)
        else None
    )
    if isinstance(latest_trend_timestamp, datetime):
        latest_day_start = _as_utc(latest_trend_timestamp).replace(hour=0, minute=0, second=0, microsecond=0)
        trend_window_end = latest_day_start + timedelta(days=1)
    else:
        trend_window_end = current_midnight_utc
    trend_window_start = trend_window_end - timedelta(days=scope_days)

    match_metrics: dict[str, Any] = {
        "timestamp": {"$gte": metrics_window_start, "$lt": metrics_window_end},
        **scope_filter,
    }
    match_trend: dict[str, Any] = {
        "timestamp": {"$gte": trend_window_start, "$lt": trend_window_end},
        **scope_filter,
    }
    # Model options should not disappear when time/model filters narrow the main dataset.
    match_models: dict[str, Any] = {
        **scope_filter,
    }
    if args.model:
        match_metrics["model"] = args.model
        match_trend["model"] = args.model

    projection = {
        "_id": 0,
        "timestamp": 1,
        "metrics_version": 1,
        "ok": 1,
        "model": 1,
        "endpoint_family": 1,
        "endpoint_base": 1,
        "metrics.first_sse_event_ms": 1,
        "metrics.first_reasoning_token_ms": 1,
        "metrics.first_answer_token_ms": 1,
        "metrics.ttft_ms": 1,
        "metrics.thinking_window_ms": 1,
        "metrics.time_to_completed_answer_ms": 1,
        "metrics.provider_output_tokens_per_second": 1,
        "metrics.provider_output_tokens_per_second_end_to_end": 1,
        "metrics.output_tokens_per_second_post_ttft": 1,
        "metrics.visible_output_tokens_per_second": 1,
        "metrics.generation_window_ms": 1,
        "metrics.total_latency_ms": 1,
        "tokens.completion_tokens": 1,
        "error.type": 1,
    }

    docs_v4 = list(
        collection.find(
            {**match_metrics, "metrics_version": {"$gte": 4}},
            projection=projection,
        ).sort("timestamp", 1)
    )
    using_legacy_metrics = False
    docs = docs_v4
    if not docs:
        using_legacy_metrics = True
        docs = list(collection.find(match_metrics, projection=projection).sort("timestamp", 1))

    trend_docs_v4 = list(
        collection.find(
            {**match_trend, "metrics_version": {"$gte": 4}},
            projection=projection,
        ).sort("timestamp", 1)
    )
    trend_docs = trend_docs_v4
    if not trend_docs:
        trend_docs = list(collection.find(match_trend, projection=projection).sort("timestamp", 1))

    total_requests = len(docs)
    success_docs = [d for d in docs if d.get("ok")]
    failure_docs = [d for d in docs if not d.get("ok")]
    trend_success_docs = [d for d in trend_docs if d.get("ok")]

    ttft_values = _collect_metric_values(success_docs, "ttft_ms")
    first_sse_values = _collect_metric_values(success_docs, "first_sse_event_ms")
    first_reasoning_values = _collect_metric_values(success_docs, "first_reasoning_token_ms")
    first_answer_values = _collect_metric_values(success_docs, "first_answer_token_ms")
    sse_to_visible_gap_values = _collect_metric_gap_values(success_docs, "ttft_ms", "first_sse_event_ms")
    thinking_window_values = _collect_metric_values(success_docs, "thinking_window_ms")
    completed_answer_values = _collect_metric_values(success_docs, "time_to_completed_answer_ms")
    provider_tps_values = [
        value
        for d in success_docs
        for value in [_extract_stable_tps(d, "provider_output_tokens_per_second")]
        if value is not None
    ]
    provider_tps_e2e_values = _collect_metric_values(success_docs, "provider_output_tokens_per_second_end_to_end")
    output_tps_values = [
        value
        for d in success_docs
        for value in [_extract_output_tps_post_ttft(d)]
        if value is not None
    ]
    visible_tps_values = [
        value
        for d in success_docs
        for value in [_extract_stable_tps(d, "visible_output_tokens_per_second")]
        if value is not None
    ]
    total_latency_values = _collect_metric_values(success_docs, "total_latency_ms")

    buckets: dict[str, dict[str, float]] = defaultdict(
        lambda: {
            "output_sum": 0.0,
            "output_count": 0.0,
            "visible_sum": 0.0,
            "visible_count": 0.0,
            "provider_sum": 0.0,
            "provider_count": 0.0,
        }
    )
    for d in trend_success_docs:
        output_tps = _extract_output_tps_post_ttft(d)
        visible_tps = _extract_stable_tps(d, "visible_output_tokens_per_second")
        provider_tps = _extract_stable_tps(d, "provider_output_tokens_per_second")
        ts = d.get("timestamp")
        if not isinstance(ts, datetime):
            continue
        bucket = ts.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
        key = bucket.isoformat()
        if output_tps is not None:
            buckets[key]["output_sum"] += float(output_tps)
            buckets[key]["output_count"] += 1
        if visible_tps is not None:
            buckets[key]["visible_sum"] += float(visible_tps)
            buckets[key]["visible_count"] += 1
        if provider_tps is not None:
            buckets[key]["provider_sum"] += float(provider_tps)
            buckets[key]["provider_count"] += 1

    trend = []
    bucket_cursor = trend_window_start
    while bucket_cursor < trend_window_end:
        key = bucket_cursor.isoformat()
        data = buckets.get(key)
        trend.append(
            {
                "timestamp": key,
                "output_tps": round(data["output_sum"] / data["output_count"], 3)
                if data and data["output_count"] > 0
                else None,
                "visible_tps": round(data["visible_sum"] / data["visible_count"], 3)
                if data and data["visible_count"] > 0
                else None,
                "provider_tps": round(data["provider_sum"] / data["provider_count"], 3)
                if data and data["provider_count"] > 0
                else None,
            }
        )
        bucket_cursor += timedelta(hours=1)

    error_breakdown: dict[str, int] = defaultdict(int)
    for d in failure_docs:
        error_type = _as_dict(d.get("error")).get("type") or "unknown_error"
        error_breakdown[error_type] += 1

    models = sorted(
        [
            model
            for model in collection.distinct("model", match_models)
            if isinstance(model, str) and model
        ]
    )
    if not models:
        models = ["glm-4.7", "glm-5"]
    latest_ts = docs[-1].get("timestamp") if docs else (trend_docs[-1].get("timestamp") if trend_docs else None)

    next_run = _next_thirty_mark(now_utc)
    cadence_label = "Updates every hour"

    payload = {
        "window": {
            "hours": scope_days * 24,
            "start": _to_iso(trend_window_start),
            "end": _to_iso(trend_window_end),
        },
        "totals": {
            "requests": total_requests,
            "successes": len(success_docs),
            "failures": len(failure_docs),
            "success_rate_percent": round((len(success_docs) / total_requests) * 100, 2)
            if total_requests
            else None,
        },
        "metrics": {
            "avg_first_sse_event_ms": round(sum(first_sse_values) / len(first_sse_values), 2)
            if first_sse_values
            else None,
            "avg_first_reasoning_token_ms": round(sum(first_reasoning_values) / len(first_reasoning_values), 2)
            if first_reasoning_values
            else None,
            "avg_first_answer_token_ms": round(sum(first_answer_values) / len(first_answer_values), 2)
            if first_answer_values
            else None,
            "avg_ttft_ms": round(sum(ttft_values) / len(ttft_values), 2) if ttft_values else None,
            "avg_sse_to_visible_gap_ms": round(sum(sse_to_visible_gap_values) / len(sse_to_visible_gap_values), 2)
            if sse_to_visible_gap_values
            else None,
            "avg_thinking_window_ms": round(sum(thinking_window_values) / len(thinking_window_values), 2)
            if thinking_window_values
            else None,
            "avg_time_to_completed_answer_ms": round(sum(completed_answer_values) / len(completed_answer_values), 2)
            if completed_answer_values
            else None,
            "avg_visible_tps": round(sum(visible_tps_values) / len(visible_tps_values), 3)
            if visible_tps_values
            else None,
            "avg_output_tps": round(sum(output_tps_values) / len(output_tps_values), 3)
            if output_tps_values
            else None,
            "avg_provider_tps": round(sum(provider_tps_values) / len(provider_tps_values), 3)
            if provider_tps_values
            else None,
            "avg_provider_tps_end_to_end": round(sum(provider_tps_e2e_values) / len(provider_tps_e2e_values), 3)
            if provider_tps_e2e_values
            else None,
            "p95_total_latency_ms": round(_percentile(total_latency_values, 0.95), 2)
            if total_latency_values
            else None,
        },
        "trend": trend,
        "errors": [{"type": k, "count": v} for k, v in sorted(error_breakdown.items(), key=lambda kv: kv[1], reverse=True)],
        "models": models,
        "endpoint_families": list(ENDPOINT_FAMILIES),
        "selected_endpoint_family": endpoint_family,
        "selected_model": args.model or None,
        "using_legacy_metrics": using_legacy_metrics,
        "latest_document_timestamp": _to_iso(latest_ts if isinstance(latest_ts, datetime) else None),
        "schedule": {
            "cadence_label": cadence_label,
            "next_run_utc": _to_iso(next_run),
        },
        "generated_at": _to_iso(datetime.now(timezone.utc)),
    }

    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
