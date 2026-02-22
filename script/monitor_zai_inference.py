#!/usr/bin/env python3
"""Cron-friendly z.ai inference speed monitor.

Required env vars:
- ZAI_API_KEY
- ZAI_BASE_URL (e.g. https://api.z.ai/api/coding/paas/v4)
- ZAI_MODEL
- MONGODB_URI

Optional env vars:
- ZAI_ENDPOINT_FAMILY (coding_plan|official_api; inferred from ZAI_BASE_URL when omitted)
- ZAI_PROVIDER (default: z.ai)
- MONGO_DB (default: zaimonitor)
- MONGO_COLLECTION (default: inference_runs)
- CONNECT_TIMEOUT_SECONDS (default: 15)
- STREAM_READ_TIMEOUT_SECONDS (default: 600)
- HTTP_TIMEOUT_SECONDS (legacy fallback for stream read timeout)
- REQUEST_RETRIES (default: 2)
- REQUEST_RETRY_BACKOFF_SECONDS (default: 1.5)
- AUTO_LOAD_DOTENV (default: true)
- ENV_FILE (default: .env)
- LOG_PROGRESS (default: true)
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Optional, Tuple

import requests
from pymongo import ASCENDING, IndexModel, MongoClient
from pymongo.collection import Collection


PROMPT_SUITE = [
    (
        "Write a complete Python function `is_palindrome(text: str) -> bool` that ignores "
        "case and non-alphanumeric characters. Then provide exactly 2 pytest tests using these "
        "inputs and expected outputs: 'RaceCar' -> True, 'hello' -> False. Return only code."
    ),
    (
        "Given this JavaScript snippet: `const nums=[1,2,3,4,5,6];` write a cleaner function "
        "`getEvenSquares(nums)` that returns the squares of even numbers. Use modern JS "
        "(arrow functions, filter, map). Then show the exact output for the given `nums`."
    ),
    (
        "Analyze the following JSON and return: (1) total requests, (2) error rate in %, "
        "(3) average latency_ms for successful requests only, (4) top 2 endpoints by total "
        "traffic.\n\n"
        "JSON:\n"
        "{\n"
        "  \"window\": \"2026-02-21T10:00:00Z/2026-02-21T10:05:00Z\",\n"
        "  \"requests\": [\n"
        "    {\"id\":\"r1\",\"endpoint\":\"/chat/completions\",\"status\":200,\"latency_ms\":820},\n"
        "    {\"id\":\"r2\",\"endpoint\":\"/chat/completions\",\"status\":200,\"latency_ms\":910},\n"
        "    {\"id\":\"r3\",\"endpoint\":\"/embeddings\",\"status\":500,\"latency_ms\":1200},\n"
        "    {\"id\":\"r4\",\"endpoint\":\"/chat/completions\",\"status\":429,\"latency_ms\":300},\n"
        "    {\"id\":\"r5\",\"endpoint\":\"/embeddings\",\"status\":200,\"latency_ms\":640},\n"
        "    {\"id\":\"r6\",\"endpoint\":\"/rerank\",\"status\":200,\"latency_ms\":450},\n"
        "    {\"id\":\"r7\",\"endpoint\":\"/chat/completions\",\"status\":200,\"latency_ms\":780},\n"
        "    {\"id\":\"r8\",\"endpoint\":\"/rerank\",\"status\":503,\"latency_ms\":990},\n"
        "    {\"id\":\"r9\",\"endpoint\":\"/chat/completions\",\"status\":200,\"latency_ms\":870},\n"
        "    {\"id\":\"r10\",\"endpoint\":\"/embeddings\",\"status\":200,\"latency_ms\":610},\n"
        "    {\"id\":\"r11\",\"endpoint\":\"/chat/completions\",\"status\":200,\"latency_ms\":760},\n"
        "    {\"id\":\"r12\",\"endpoint\":\"/chat/completions\",\"status\":200,\"latency_ms\":840},\n"
        "    {\"id\":\"r13\",\"endpoint\":\"/embeddings\",\"status\":200,\"latency_ms\":590},\n"
        "    {\"id\":\"r14\",\"endpoint\":\"/rerank\",\"status\":200,\"latency_ms\":430},\n"
        "    {\"id\":\"r15\",\"endpoint\":\"/chat/completions\",\"status\":504,\"latency_ms\":1500},\n"
        "    {\"id\":\"r16\",\"endpoint\":\"/embeddings\",\"status\":200,\"latency_ms\":605},\n"
        "    {\"id\":\"r17\",\"endpoint\":\"/chat/completions\",\"status\":200,\"latency_ms\":790},\n"
        "    {\"id\":\"r18\",\"endpoint\":\"/rerank\",\"status\":200,\"latency_ms\":470},\n"
        "    {\"id\":\"r19\",\"endpoint\":\"/chat/completions\",\"status\":200,\"latency_ms\":815},\n"
        "    {\"id\":\"r20\",\"endpoint\":\"/embeddings\",\"status\":200,\"latency_ms\":625}\n"
        "  ]\n"
        "}\n\n"
        "Treat status >= 400 as errors. Show calculations briefly."
    ),
    (
        "Write a short SQL query for PostgreSQL. Schema: orders(order_id, created_at, status), "
        "order_items(order_id, product_id, quantity, unit_price), products(product_id, name). "
        "Goal: top 3 products by revenue in last 30 days from completed orders only "
        "(orders.status='completed'). Return columns: product_id, name, revenue."
    ),
    (
        "Provide a concise pull request reliability checklist with exactly 8 bullet points, "
        "focused on error handling, retries, timeouts, observability, and rollback safety."
    ),
]

METRICS_VERSION = 4
ENDPOINT_FAMILY_CODING_PLAN = "coding_plan"
ENDPOINT_FAMILY_OFFICIAL_API = "official_api"
ENDPOINT_FAMILY_VALUES = {
    ENDPOINT_FAMILY_CODING_PLAN,
    ENDPOINT_FAMILY_OFFICIAL_API,
}


@dataclass
class Config:
    zai_api_key: str
    zai_base_url: str
    zai_model: str
    mongodb_uri: str
    zai_endpoint_family: str = ENDPOINT_FAMILY_CODING_PLAN
    zai_provider: str = "z.ai"
    mongo_db: str = "zaimonitor"
    mongo_collection: str = "inference_runs"
    connect_timeout_seconds: int = 15
    stream_read_timeout_seconds: int = 600
    request_retries: int = 2
    request_retry_backoff_seconds: float = 1.5
    log_progress: bool = True


class ConfigError(Exception):
    pass


def infer_endpoint_family(zai_base_url: str) -> str:
    normalized = zai_base_url.rstrip("/").lower()
    if "/api/coding/paas/v4" in normalized:
        return ENDPOINT_FAMILY_CODING_PLAN
    if "/api/paas/v4" in normalized:
        return ENDPOINT_FAMILY_OFFICIAL_API
    return ENDPOINT_FAMILY_CODING_PLAN


def parse_endpoint_family(raw: Optional[str], zai_base_url: str) -> str:
    if not raw:
        return infer_endpoint_family(zai_base_url)

    value = raw.strip().lower().replace("-", "_")
    if value not in ENDPOINT_FAMILY_VALUES:
        allowed = ", ".join(sorted(ENDPOINT_FAMILY_VALUES))
        raise ConfigError(f"ZAI_ENDPOINT_FAMILY must be one of: {allowed}")
    return value


def _parse_env_line(line: str) -> Optional[Tuple[str, str]]:
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return None
    if stripped.startswith("export "):
        stripped = stripped[len("export ") :].strip()
    if "=" not in stripped:
        return None

    key, value = stripped.split("=", 1)
    key = key.strip()
    value = value.strip()

    if not key:
        return None

    if (value.startswith('"') and value.endswith('"')) or (
        value.startswith("'") and value.endswith("'")
    ):
        value = value[1:-1]

    return key, value


def load_dotenv_into_environ() -> None:
    auto_load = os.getenv("AUTO_LOAD_DOTENV", "true").strip().lower()
    if auto_load in {"0", "false", "no", "off"}:
        return

    env_file = os.getenv("ENV_FILE", ".env")
    path = Path(env_file)
    if not path.is_absolute():
        path = Path.cwd() / path

    if not path.exists() or not path.is_file():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        parsed = _parse_env_line(raw_line)
        if not parsed:
            continue
        key, value = parsed
        os.environ.setdefault(key, value)


def load_config() -> Config:
    required = ["ZAI_API_KEY", "ZAI_BASE_URL", "ZAI_MODEL", "MONGODB_URI"]
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise ConfigError(f"Missing required env vars: {', '.join(missing)}")

    zai_base_url = os.environ["ZAI_BASE_URL"].rstrip("/")
    endpoint_family = parse_endpoint_family(os.getenv("ZAI_ENDPOINT_FAMILY"), zai_base_url)
    provider = os.getenv("ZAI_PROVIDER", "z.ai").strip()
    if not provider:
        raise ConfigError("ZAI_PROVIDER cannot be empty")

    legacy_http_timeout = os.getenv("HTTP_TIMEOUT_SECONDS")
    stream_read_timeout = os.getenv("STREAM_READ_TIMEOUT_SECONDS", legacy_http_timeout or "600")

    return Config(
        zai_api_key=os.environ["ZAI_API_KEY"],
        zai_base_url=zai_base_url,
        zai_model=os.environ["ZAI_MODEL"],
        mongodb_uri=os.environ["MONGODB_URI"],
        zai_endpoint_family=endpoint_family,
        zai_provider=provider,
        mongo_db=os.getenv("MONGO_DB", "zaimonitor"),
        mongo_collection=os.getenv("MONGO_COLLECTION", "inference_runs"),
        connect_timeout_seconds=int(os.getenv("CONNECT_TIMEOUT_SECONDS", "15")),
        stream_read_timeout_seconds=int(stream_read_timeout),
        request_retries=int(os.getenv("REQUEST_RETRIES", "2")),
        request_retry_backoff_seconds=float(os.getenv("REQUEST_RETRY_BACKOFF_SECONDS", "1.5")),
        log_progress=os.getenv("LOG_PROGRESS", "true").strip().lower() not in {"0", "false", "no", "off"},
    )


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def estimate_visible_tokens(text: str) -> int:
    if not text:
        return 0
    return len(re.findall(r"\w+|[^\w\s]", text, flags=re.UNICODE))


def _as_optional_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _extract_usage(payload: Dict[str, Any]) -> Dict[str, Optional[int]]:
    usage = payload.get("usage")
    if not isinstance(usage, dict):
        return {
            "prompt_tokens": None,
            "completion_tokens": None,
            "total_tokens": None,
            "cached_prompt_tokens": None,
        }

    prompt_tokens_details = usage.get("prompt_tokens_details")
    cached_tokens = None
    if isinstance(prompt_tokens_details, dict):
        cached_tokens = _as_optional_int(prompt_tokens_details.get("cached_tokens"))

    return {
        "prompt_tokens": _as_optional_int(usage.get("prompt_tokens")),
        "completion_tokens": _as_optional_int(usage.get("completion_tokens")),
        "total_tokens": _as_optional_int(usage.get("total_tokens")),
        "cached_prompt_tokens": cached_tokens,
    }


def _safe_json_loads(raw: str) -> Optional[Dict[str, Any]]:
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def stream_chat_completion(
    cfg: Config,
    prompt: str,
    request_id: str,
) -> Dict[str, Any]:
    url = f"{cfg.zai_base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {cfg.zai_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": cfg.zai_model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
        "stream_options": {"include_usage": True},
    }

    attempt = 0
    last_error: Optional[str] = None
    last_attempt_start_mono = time.monotonic()
    last_attempt_start_wall = now_utc()

    while attempt <= cfg.request_retries:
        attempt += 1
        attempt_start_mono = time.monotonic()
        attempt_start_wall = now_utc()
        last_attempt_start_mono = attempt_start_mono
        last_attempt_start_wall = attempt_start_wall
        text_parts: List[str] = []
        first_sse_event_mono: Optional[float] = None
        first_any_token_mono: Optional[float] = None
        first_reasoning_mono: Optional[float] = None
        first_answer_mono: Optional[float] = None
        sse_event_count = 0
        reasoning_chunk_count = 0
        content_chunk_count = 0
        usage: Dict[str, Optional[int]] = {
            "prompt_tokens": None,
            "completion_tokens": None,
            "total_tokens": None,
            "cached_prompt_tokens": None,
        }
        status_code: Optional[int] = None
        error_payload: Optional[Dict[str, Any]] = None

        try:
            with requests.post(
                url,
                headers=headers,
                json=payload,
                stream=True,
                timeout=(cfg.connect_timeout_seconds, cfg.stream_read_timeout_seconds),
            ) as response:
                status_code = response.status_code
                headers_received_mono = time.monotonic()
                header_latency_ms = (headers_received_mono - attempt_start_mono) * 1000

                if response.status_code >= 400:
                    try:
                        error_payload = response.json()
                    except Exception:
                        error_payload = {"raw": response.text[:4000]}

                    finish_mono = time.monotonic()
                    return {
                        "ok": False,
                        "http_status": status_code,
                        "error": "http_error",
                        "error_payload": error_payload,
                        "attempt": attempt,
                        "started_at": attempt_start_wall,
                        "finished_at": now_utc(),
                        "header_latency_ms": header_latency_ms,
                        "ttft_ms": None,
                        "total_latency_ms": (finish_mono - attempt_start_mono) * 1000,
                        "generation_window_ms": None,
                        "response_text": "",
                        "response_chars": 0,
                        "usage": usage,
                        "request_id": request_id,
                    }

                for raw_line in response.iter_lines(decode_unicode=True):
                    if raw_line is None:
                        continue
                    line = raw_line.strip()
                    if not line:
                        continue
                    if not line.startswith("data:"):
                        continue

                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    if first_sse_event_mono is None:
                        first_sse_event_mono = time.monotonic()
                    sse_event_count += 1

                    event = _safe_json_loads(data)
                    if not event:
                        continue

                    event_usage = _extract_usage(event)
                    if any(v is not None for v in event_usage.values()):
                        usage = event_usage

                    choices = event.get("choices")
                    if isinstance(choices, list) and choices:
                        choice0 = choices[0]
                        delta = choice0.get("delta") if isinstance(choice0, dict) else None
                        if isinstance(delta, dict):
                            reasoning_content = delta.get("reasoning_content")
                            if isinstance(reasoning_content, str) and reasoning_content:
                                token_mono = time.monotonic()
                                if first_reasoning_mono is None:
                                    first_reasoning_mono = token_mono
                                if first_any_token_mono is None:
                                    first_any_token_mono = token_mono
                                reasoning_chunk_count += 1

                            content = delta.get("content")
                            if isinstance(content, str) and content:
                                token_mono = time.monotonic()
                                if first_answer_mono is None:
                                    first_answer_mono = token_mono
                                if first_any_token_mono is None:
                                    first_any_token_mono = token_mono
                                content_chunk_count += 1
                                text_parts.append(content)
                finish_mono = time.monotonic()

                response_text = "".join(text_parts)
                first_sse_event_ms = None
                first_reasoning_token_ms = None
                first_answer_token_ms = None
                ttft_ms = None
                thinking_window_ms = None
                generation_window_ms = None
                output_tokens_per_second = None
                output_tokens_per_second_end_to_end = None
                output_tokens_per_second_post_ttft = None
                time_to_completed_answer_ms = None

                if first_sse_event_mono is not None:
                    first_sse_event_ms = (first_sse_event_mono - attempt_start_mono) * 1000
                if first_reasoning_mono is not None:
                    first_reasoning_token_ms = (first_reasoning_mono - attempt_start_mono) * 1000
                if first_answer_mono is not None:
                    first_answer_token_ms = (first_answer_mono - attempt_start_mono) * 1000
                    generation_window_ms = max((finish_mono - first_answer_mono) * 1000, 0.0)
                if first_any_token_mono is not None:
                    ttft_ms = (first_any_token_mono - attempt_start_mono) * 1000
                if first_reasoning_mono is not None and first_answer_mono is not None:
                    thinking_window_ms = max((first_answer_mono - first_reasoning_mono) * 1000, 0.0)

                completion_tokens = usage.get("completion_tokens")
                if (
                    completion_tokens is not None
                    and generation_window_ms is not None
                    and generation_window_ms > 0
                ):
                    output_tokens_per_second = completion_tokens / (generation_window_ms / 1000)
                total_latency_ms = (finish_mono - attempt_start_mono) * 1000
                time_to_completed_answer_ms = total_latency_ms
                if completion_tokens is not None and total_latency_ms > 0:
                    output_tokens_per_second_end_to_end = completion_tokens / (total_latency_ms / 1000)
                if (
                    completion_tokens is not None
                    and completion_tokens > 1
                    and ttft_ms is not None
                    and total_latency_ms > ttft_ms
                ):
                    output_tokens_per_second_post_ttft = (completion_tokens - 1) / (
                        (total_latency_ms - ttft_ms) / 1000
                    )

                return {
                    "ok": True,
                    "http_status": status_code,
                    "error": None,
                    "error_payload": None,
                    "attempt": attempt,
                    "started_at": attempt_start_wall,
                    "finished_at": now_utc(),
                    "header_latency_ms": header_latency_ms,
                    "first_sse_event_ms": first_sse_event_ms,
                    "first_reasoning_token_ms": first_reasoning_token_ms,
                    "first_answer_token_ms": first_answer_token_ms,
                    "ttft_ms": ttft_ms,
                    "thinking_window_ms": thinking_window_ms,
                    "time_to_completed_answer_ms": time_to_completed_answer_ms,
                    "total_latency_ms": total_latency_ms,
                    "generation_window_ms": generation_window_ms,
                    "output_tokens_per_second": output_tokens_per_second,
                    "output_tokens_per_second_end_to_end": output_tokens_per_second_end_to_end,
                    "output_tokens_per_second_post_ttft": output_tokens_per_second_post_ttft,
                    "sse_event_count": sse_event_count,
                    "reasoning_chunk_count": reasoning_chunk_count,
                    "content_chunk_count": content_chunk_count,
                    "response_text": response_text,
                    "response_chars": len(response_text),
                    "usage": usage,
                    "request_id": request_id,
                }

        except requests.RequestException as exc:
            last_error = str(exc)
            if attempt <= cfg.request_retries:
                time.sleep(cfg.request_retry_backoff_seconds * attempt)
                continue

            finish_mono = time.monotonic()
            return {
                "ok": False,
                "http_status": status_code,
                "error": "network_error",
                "error_payload": {"message": last_error},
                "attempt": attempt,
                "started_at": attempt_start_wall,
                "finished_at": now_utc(),
                "header_latency_ms": None,
                "ttft_ms": None,
                "total_latency_ms": (finish_mono - attempt_start_mono) * 1000,
                "generation_window_ms": None,
                "response_text": "",
                "response_chars": 0,
                "usage": usage,
                "request_id": request_id,
            }

    finish_mono = time.monotonic()
    return {
        "ok": False,
        "http_status": None,
        "error": "unknown_error",
        "error_payload": {"message": last_error or "Unknown failure"},
        "attempt": attempt,
        "started_at": last_attempt_start_wall,
        "finished_at": now_utc(),
        "header_latency_ms": None,
        "ttft_ms": None,
        "total_latency_ms": (finish_mono - last_attempt_start_mono) * 1000,
        "generation_window_ms": None,
        "response_text": "",
        "response_chars": 0,
        "usage": {
            "prompt_tokens": None,
            "completion_tokens": None,
            "total_tokens": None,
            "cached_prompt_tokens": None,
        },
        "request_id": request_id,
    }


def build_mongo_collection(cfg: Config) -> Collection:
    client = MongoClient(cfg.mongodb_uri, serverSelectionTimeoutMS=10000)
    db = client[cfg.mongo_db]
    collection = db[cfg.mongo_collection]
    return collection


def ensure_collection_indexes(collection: Collection) -> None:
    collection.create_indexes(
        [
            IndexModel([("timestamp", ASCENDING)], name="timestamp_asc"),
            IndexModel([("model", ASCENDING), ("timestamp", ASCENDING)], name="model_timestamp_asc"),
            IndexModel(
                [("endpoint_family", ASCENDING), ("timestamp", ASCENDING)],
                name="endpoint_family_timestamp_asc",
            ),
            IndexModel(
                [("endpoint_family", ASCENDING), ("model", ASCENDING), ("timestamp", ASCENDING)],
                name="endpoint_family_model_timestamp_asc",
            ),
            IndexModel([("ok", ASCENDING), ("timestamp", ASCENDING)], name="ok_timestamp_asc"),
            IndexModel(
                [("metrics_version", ASCENDING), ("timestamp", ASCENDING)],
                name="metrics_version_timestamp_asc",
            ),
        ]
    )


def build_document(
    cfg: Config,
    result: Dict[str, Any],
) -> Dict[str, Any]:
    usage = result.get("usage") or {}
    completion_tokens = usage.get("completion_tokens")
    cached_prompt_tokens = usage.get("cached_prompt_tokens")
    response_text = result.get("response_text") or ""
    visible_output_tokens_estimate = estimate_visible_tokens(response_text)

    visible_tokens_per_second = None
    generation_window_ms = result.get("generation_window_ms")
    response_chars = result.get("response_chars")
    if generation_window_ms and generation_window_ms > 0 and response_chars is not None:
        visible_tokens_per_second = visible_output_tokens_estimate / (generation_window_ms / 1000)

    return {
        "timestamp": now_utc(),
        "metrics_version": METRICS_VERSION,
        "endpoint_family": cfg.zai_endpoint_family,
        "endpoint_base": cfg.zai_base_url,
        "model": cfg.zai_model,
        "ok": result.get("ok", False),
        "metrics": {
            "first_sse_event_ms": result.get("first_sse_event_ms"),
            "first_reasoning_token_ms": result.get("first_reasoning_token_ms"),
            "first_answer_token_ms": result.get("first_answer_token_ms"),
            "ttft_ms": result.get("ttft_ms"),
            "thinking_window_ms": result.get("thinking_window_ms"),
            "time_to_completed_answer_ms": result.get("time_to_completed_answer_ms"),
            "total_latency_ms": result.get("total_latency_ms"),
            "generation_window_ms": generation_window_ms,
            "provider_output_tokens_per_second": result.get("output_tokens_per_second"),
            "provider_output_tokens_per_second_end_to_end": result.get("output_tokens_per_second_end_to_end"),
            "output_tokens_per_second_post_ttft": result.get("output_tokens_per_second_post_ttft"),
            "visible_output_tokens_per_second": visible_tokens_per_second,
        },
        "tokens": {
            "completion_tokens": completion_tokens,
            "cached_prompt_tokens": cached_prompt_tokens,
        },
        "error": {
            "type": result.get("error"),
        },
    }


def print_summary(run_id: str, cfg: Config, documents: List[Dict[str, Any]]) -> None:
    total = len(documents)
    successes = [doc for doc in documents if doc.get("ok")]
    failures = total - len(successes)

    ttft_values = [
        doc["metrics"]["ttft_ms"]
        for doc in successes
        if doc.get("metrics", {}).get("ttft_ms") is not None
    ]
    first_sse_values = [
        doc["metrics"]["first_sse_event_ms"]
        for doc in successes
        if doc.get("metrics", {}).get("first_sse_event_ms") is not None
    ]
    first_reasoning_values = [
        doc["metrics"]["first_reasoning_token_ms"]
        for doc in successes
        if doc.get("metrics", {}).get("first_reasoning_token_ms") is not None
    ]
    thinking_window_values = [
        doc["metrics"]["thinking_window_ms"]
        for doc in successes
        if doc.get("metrics", {}).get("thinking_window_ms") is not None
    ]
    first_answer_values = [
        doc["metrics"]["first_answer_token_ms"]
        for doc in successes
        if doc.get("metrics", {}).get("first_answer_token_ms") is not None
    ]
    completed_answer_values = [
        doc["metrics"]["time_to_completed_answer_ms"]
        for doc in successes
        if doc.get("metrics", {}).get("time_to_completed_answer_ms") is not None
    ]
    ttft_gap_values = [
        doc["metrics"]["ttft_ms"] - doc["metrics"]["first_sse_event_ms"]
        for doc in successes
        if doc.get("metrics", {}).get("ttft_ms") is not None
        and doc.get("metrics", {}).get("first_sse_event_ms") is not None
    ]
    tps_values = [
        doc["metrics"]["provider_output_tokens_per_second"]
        for doc in successes
        if doc.get("metrics", {}).get("provider_output_tokens_per_second") is not None
    ]
    visible_tps_values = [
        doc["metrics"]["visible_output_tokens_per_second"]
        for doc in successes
        if doc.get("metrics", {}).get("visible_output_tokens_per_second") is not None
    ]
    output_tps_post_ttft_values = [
        doc["metrics"]["output_tokens_per_second_post_ttft"]
        for doc in successes
        if doc.get("metrics", {}).get("output_tokens_per_second_post_ttft") is not None
    ]
    total_latency_values = [
        doc["metrics"]["total_latency_ms"]
        for doc in successes
        if doc.get("metrics", {}).get("total_latency_ms") is not None
    ]

    print(
        json.dumps(
            {
                "run_id": run_id,
                "provider": cfg.zai_provider,
                "endpoint_family": cfg.zai_endpoint_family,
                "endpoint_base": cfg.zai_base_url,
                "model": cfg.zai_model,
                "total_requests": total,
                "successes": len(successes),
                "failures": failures,
                "avg_first_sse_event_ms": mean(first_sse_values) if first_sse_values else None,
                "avg_first_reasoning_token_ms": mean(first_reasoning_values) if first_reasoning_values else None,
                "avg_first_answer_token_ms": mean(first_answer_values) if first_answer_values else None,
                "avg_ttft_ms": mean(ttft_values) if ttft_values else None,
                "avg_sse_to_visible_gap_ms": mean(ttft_gap_values) if ttft_gap_values else None,
                "avg_thinking_window_ms": mean(thinking_window_values) if thinking_window_values else None,
                "avg_time_to_completed_answer_ms": mean(completed_answer_values) if completed_answer_values else None,
                "avg_provider_output_tokens_per_second": mean(tps_values) if tps_values else None,
                "avg_output_tokens_per_second_post_ttft": mean(output_tps_post_ttft_values)
                if output_tps_post_ttft_values
                else None,
                "avg_visible_output_tokens_per_second": mean(visible_tps_values) if visible_tps_values else None,
                "avg_total_latency_ms": mean(total_latency_values) if total_latency_values else None,
                "max_total_latency_ms": max(total_latency_values) if total_latency_values else None,
                "timestamp": now_utc().isoformat(),
            },
            ensure_ascii=False,
        )
    )


def print_progress(event: str, payload: Dict[str, Any], enabled: bool) -> None:
    if not enabled:
        return
    print(
        json.dumps(
            {
                "event": event,
                "timestamp": now_utc().isoformat(),
                **payload,
            },
            ensure_ascii=False,
        )
    )


def main() -> int:
    load_dotenv_into_environ()

    try:
        cfg = load_config()
    except ConfigError as exc:
        print(f"CONFIG_ERROR: {exc}", file=sys.stderr)
        return 2

    run_id = str(uuid.uuid4())
    documents: List[Dict[str, Any]] = []

    print_progress(
        event="run_start",
        payload={
            "run_id": run_id,
            "provider": cfg.zai_provider,
            "endpoint_family": cfg.zai_endpoint_family,
            "model": cfg.zai_model,
            "base_url": cfg.zai_base_url,
            "prompt_count": len(PROMPT_SUITE),
        },
        enabled=cfg.log_progress,
    )

    for prompt_index, prompt in enumerate(PROMPT_SUITE, start=1):
        request_id = str(uuid.uuid4())
        print_progress(
            event="request_start",
            payload={
                "run_id": run_id,
                "request_id": request_id,
                "endpoint_family": cfg.zai_endpoint_family,
                "prompt_index": prompt_index,
                "prompt_length": len(prompt),
            },
            enabled=cfg.log_progress,
        )

        result = stream_chat_completion(cfg=cfg, prompt=prompt, request_id=request_id)
        document = build_document(cfg, result)
        documents.append(document)

        print_progress(
            event="request_done",
            payload={
                "run_id": run_id,
                "request_id": request_id,
                "endpoint_family": cfg.zai_endpoint_family,
                "prompt_index": prompt_index,
                "ok": result.get("ok"),
                "http_status": result.get("http_status"),
                "header_latency_ms": result.get("header_latency_ms"),
                "first_sse_event_ms": result.get("first_sse_event_ms"),
                "first_reasoning_token_ms": result.get("first_reasoning_token_ms"),
                "first_answer_token_ms": result.get("first_answer_token_ms"),
                "ttft_ms": result.get("ttft_ms"),
                "thinking_window_ms": result.get("thinking_window_ms"),
                "time_to_completed_answer_ms": result.get("time_to_completed_answer_ms"),
                "total_latency_ms": result.get("total_latency_ms"),
                "provider_output_tokens_per_second": result.get("output_tokens_per_second"),
                "output_tokens_per_second_post_ttft": result.get("output_tokens_per_second_post_ttft"),
                "visible_output_tokens_per_second": document.get("metrics", {}).get("visible_output_tokens_per_second"),
                "cached_prompt_tokens": document.get("tokens", {}).get("cached_prompt_tokens"),
            },
            enabled=cfg.log_progress,
        )

    try:
        collection = build_mongo_collection(cfg)
        ensure_collection_indexes(collection)
        if documents:
            collection.insert_many(documents, ordered=True)
    except Exception as exc:
        print(f"MONGO_WRITE_ERROR: {exc}", file=sys.stderr)
        print_summary(run_id, cfg, documents)
        return 3

    print_summary(run_id, cfg, documents)

    if all(not d.get("ok", False) for d in documents):
        return 4

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
