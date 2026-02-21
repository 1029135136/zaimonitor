#!/usr/bin/env python3
"""Inspect streamed SSE chunks from z.ai chat completions.

Use this to verify what is streamed first (reasoning/content/tool_calls)
and to inspect chunk-level payloads.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import requests


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


@dataclass
class Config:
    api_key: str
    base_url: str
    model: str
    connect_timeout_seconds: int
    stream_read_timeout_seconds: int
    max_preview_chars: int
    raw: bool


def _safe_json_loads(raw: str) -> Optional[Dict[str, Any]]:
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def _preview(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3] + "..."


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspect z.ai streamed SSE chunks (content/reasoning/tool_calls)."
    )
    parser.add_argument(
        "--prompt",
        default="Explain in one short paragraph what TTFT measures.",
        help="User prompt to send.",
    )
    parser.add_argument(
        "--with-tools",
        action="store_true",
        help="Include one demo tool schema so tool_calls can be observed if the model chooses.",
    )
    parser.add_argument(
        "--raw",
        action="store_true",
        help="Print raw event JSON for each chunk.",
    )
    parser.add_argument(
        "--max-preview-chars",
        type=int,
        default=120,
        help="Max characters to print for content/reasoning/tool argument previews.",
    )
    parser.add_argument(
        "--connect-timeout-seconds",
        type=int,
        default=int(os.getenv("CONNECT_TIMEOUT_SECONDS", "15")),
    )
    parser.add_argument(
        "--stream-read-timeout-seconds",
        type=int,
        default=int(os.getenv("STREAM_READ_TIMEOUT_SECONDS", os.getenv("HTTP_TIMEOUT_SECONDS", "600"))),
    )
    parser.add_argument("--model", default=os.getenv("ZAI_MODEL", ""))
    parser.add_argument(
        "--base-url",
        default=os.getenv("ZAI_BASE_URL", "https://api.z.ai/api/coding/paas/v4"),
    )
    parser.add_argument("--api-key", default=os.getenv("ZAI_API_KEY", ""))
    return parser.parse_args()


def build_config(args: argparse.Namespace) -> Config:
    if not args.api_key:
        raise ValueError("Missing API key. Set ZAI_API_KEY or pass --api-key.")
    if not args.model:
        raise ValueError("Missing model. Set ZAI_MODEL or pass --model.")
    return Config(
        api_key=args.api_key,
        base_url=args.base_url.rstrip("/"),
        model=args.model,
        connect_timeout_seconds=args.connect_timeout_seconds,
        stream_read_timeout_seconds=args.stream_read_timeout_seconds,
        max_preview_chars=max(args.max_preview_chars, 20),
        raw=args.raw,
    )


def run_stream(cfg: Config, prompt: str, with_tools: bool) -> int:
    url = f"{cfg.base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {cfg.api_key}",
        "Content-Type": "application/json",
    }
    payload: Dict[str, Any] = {
        "model": cfg.model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    if with_tools:
        payload["tools"] = [
            {
                "type": "function",
                "function": {
                    "name": "get_latency_policy",
                    "description": "Return one sentence about latency policy.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "region": {"type": "string"},
                        },
                        "required": ["region"],
                    },
                },
            }
        ]
        payload["tool_choice"] = "auto"

    start = time.monotonic()
    first_sse: Optional[float] = None
    first_reasoning: Optional[float] = None
    first_content: Optional[float] = None

    sse_count = 0
    reasoning_chunk_count = 0
    content_chunk_count = 0
    tool_call_chunk_count = 0
    saw_tool_calls = False
    final_finish_reason: Optional[str] = None
    usage: Dict[str, Any] = {}

    # Reconstruct tool call fragments over chunks.
    tool_state: Dict[int, Dict[str, Any]] = {}

    print(f"url={url}")
    print(f"model={cfg.model}")
    print(f"with_tools={with_tools}")
    print("---- STREAM START ----")

    with requests.post(
        url,
        headers=headers,
        json=payload,
        stream=True,
        timeout=(cfg.connect_timeout_seconds, cfg.stream_read_timeout_seconds),
    ) as response:
        print(f"http_status={response.status_code}")
        if response.status_code >= 400:
            try:
                err = response.json()
            except Exception:
                err = {"raw": response.text[:4000]}
            print(json.dumps(err, ensure_ascii=False, indent=2))
            return 1

        for raw_line in response.iter_lines(decode_unicode=True):
            if raw_line is None:
                continue
            line = raw_line.strip()
            if not line or not line.startswith("data:"):
                continue

            data = line[5:].strip()
            if data == "[DONE]":
                print("chunk=[DONE]")
                break

            if first_sse is None:
                first_sse = time.monotonic()
            sse_count += 1

            event = _safe_json_loads(data)
            if event is None:
                print(f"chunk#{sse_count}: non_json")
                continue

            if cfg.raw:
                print(f"chunk#{sse_count} raw={json.dumps(event, ensure_ascii=False)}")

            event_usage = event.get("usage")
            if isinstance(event_usage, dict):
                usage = event_usage

            choices = event.get("choices")
            if not (isinstance(choices, list) and choices):
                print(f"chunk#{sse_count}: no_choices")
                continue

            choice0 = choices[0]
            if not isinstance(choice0, dict):
                print(f"chunk#{sse_count}: invalid_choice")
                continue

            finish_reason = choice0.get("finish_reason")
            if isinstance(finish_reason, str) and finish_reason:
                final_finish_reason = finish_reason

            delta = choice0.get("delta")
            if not isinstance(delta, dict):
                print(f"chunk#{sse_count}: no_delta finish_reason={finish_reason}")
                continue

            reasoning_content = delta.get("reasoning_content")
            content = delta.get("content")
            tool_calls = delta.get("tool_calls")

            summary_parts = []

            if isinstance(reasoning_content, str) and reasoning_content:
                if first_reasoning is None:
                    first_reasoning = time.monotonic()
                reasoning_chunk_count += 1
                summary_parts.append(
                    f"reasoning='{_preview(reasoning_content, cfg.max_preview_chars)}'"
                )

            if isinstance(content, str) and content:
                if first_content is None:
                    first_content = time.monotonic()
                content_chunk_count += 1
                summary_parts.append(f"content='{_preview(content, cfg.max_preview_chars)}'")

            if isinstance(tool_calls, list) and tool_calls:
                saw_tool_calls = True
                tool_call_chunk_count += 1
                for tc in tool_calls:
                    if not isinstance(tc, dict):
                        continue
                    idx = tc.get("index")
                    if not isinstance(idx, int):
                        idx = 0
                    state = tool_state.setdefault(
                        idx,
                        {"id": None, "type": None, "name_parts": [], "arg_parts": []},
                    )

                    tc_id = tc.get("id")
                    tc_type = tc.get("type")
                    if isinstance(tc_id, str) and tc_id:
                        state["id"] = tc_id
                    if isinstance(tc_type, str) and tc_type:
                        state["type"] = tc_type

                    fn = tc.get("function")
                    if isinstance(fn, dict):
                        name = fn.get("name")
                        arguments = fn.get("arguments")
                        if isinstance(name, str) and name:
                            state["name_parts"].append(name)
                        if isinstance(arguments, str) and arguments:
                            state["arg_parts"].append(arguments)

                    fn_name = "".join(state["name_parts"])
                    arg_preview = _preview("".join(state["arg_parts"]), cfg.max_preview_chars)
                    summary_parts.append(
                        f"tool_call[idx={idx},name='{fn_name}',args='{arg_preview}']"
                    )

            if not summary_parts:
                summary_parts.append("delta=empty_or_meta")
            print(f"chunk#{sse_count}: " + " | ".join(summary_parts))

    end = time.monotonic()

    def _ms(ts: Optional[float]) -> Optional[float]:
        if ts is None:
            return None
        return (ts - start) * 1000

    print("---- STREAM SUMMARY ----")
    print(
        json.dumps(
            {
                "total_latency_ms": (end - start) * 1000,
                "first_sse_event_ms": _ms(first_sse),
                "first_reasoning_token_ms": _ms(first_reasoning),
                "first_content_token_ms": _ms(first_content),
                "sse_event_count": sse_count,
                "reasoning_chunk_count": reasoning_chunk_count,
                "content_chunk_count": content_chunk_count,
                "tool_call_chunk_count": tool_call_chunk_count,
                "saw_tool_calls": saw_tool_calls,
                "finish_reason": final_finish_reason,
                "usage": usage or None,
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    if tool_state:
        print("---- TOOL CALL RECONSTRUCTION ----")
        final_calls = []
        for idx, state in sorted(tool_state.items()):
            final_calls.append(
                {
                    "index": idx,
                    "id": state["id"],
                    "type": state["type"],
                    "name": "".join(state["name_parts"]) or None,
                    "arguments": "".join(state["arg_parts"]) or None,
                }
            )
        print(json.dumps(final_calls, ensure_ascii=False, indent=2))

    return 0


def main() -> int:
    load_dotenv_into_environ()
    args = parse_args()
    try:
        cfg = build_config(args)
    except ValueError as exc:
        print(f"CONFIG_ERROR: {exc}", file=sys.stderr)
        return 2

    try:
        return run_stream(cfg, prompt=args.prompt, with_tools=args.with_tools)
    except requests.RequestException as exc:
        print(f"REQUEST_ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

