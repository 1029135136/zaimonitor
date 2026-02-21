# MongoDB Schema: `inference_runs`

**Database:** `zaimonitor` (configurable via `MONGO_DB`)  
**Collection:** `inference_runs` (configurable via `MONGO_COLLECTION`)

## Document Structure

```json
{
  "run_id": "uuid",
  "request_id": "uuid",
  "timestamp": "ISO 8601 datetime",
  "metrics_version": 4,
  "provider": "z.ai",
  "endpoint_base": "https://api.z.ai/api/coding/paas/v4",
  "endpoint_path": "/chat/completions",
  "model": "glm-5",
  "prompt_index": 1,
  "prompt_hash": "sha256_hex_string",
  "prompt_length": 350,
  "ok": true,
  "http_status": 200,
  "attempt": 1,
  "metrics": {
    "header_latency_ms": 450,
    "first_sse_event_ms": 700,
    "first_reasoning_token_ms": 760,
    "first_answer_token_ms": 1200,
    "ttft_ms": 760,
    "thinking_window_ms": 440,
    "time_to_completed_answer_ms": 2100,
    "total_latency_ms": 2100,
    "generation_window_ms": 900,
    "provider_output_tokens_per_second": 45.5,
    "provider_output_tokens_per_second_end_to_end": 31.2,
    "visible_output_tokens_per_second": 42.1,
    "output_chars_per_second": 210.5,
    "sse_event_count": 18,
    "reasoning_chunk_count": 6,
    "content_chunk_count": 12,
    "token_visibility_ratio": 0.72
  },
  "tokens": {
    "prompt_tokens": 80,
    "completion_tokens": 150,
    "total_tokens": 230,
    "visible_output_tokens_estimate": 145
  },
  "error": {
    "type": null,
    "payload": null
  },
  "response_preview": "Python function implementation...",
  "started_at": "ISO 8601 datetime",
  "finished_at": "ISO 8601 datetime"
}
```

## Key Fields

| Field | Type | Notes |
|-------|------|-------|
| `run_id` | string | Identifier for each script execution; groups 5 prompts together |
| `request_id` | string | Unique ID per individual API request |
| `metrics_version` | int | Metric semantics version (`4` = TTFT is first any token + explicit answer-completion metrics) |
| `ok` | boolean | Success (true) or failure (false) |
| `metrics.header_latency_ms` | float | Time to HTTP response headers for the final attempt only |
| `metrics.first_sse_event_ms` | float | Time to first streamed SSE `data:` event (can be before visible text) |
| `metrics.first_reasoning_token_ms` | float | Time to first `delta.reasoning_content` chunk (thinking stream start) |
| `metrics.first_answer_token_ms` | float | Time to first `delta.content` chunk (answer stream start) |
| `metrics.ttft_ms` | float | Time to first streamed token from provider (`reasoning_content` or `content`) |
| `metrics.thinking_window_ms` | float | Time from first reasoning token to first answer token |
| `metrics.time_to_completed_answer_ms` | float | Request start to completed answer stream (`[DONE]`) |
| `metrics.total_latency_ms` | float | Final-attempt start to stream completion |
| `metrics.generation_window_ms` | float | First answer token to stream completion (`[DONE]`) |
| `metrics.provider_output_tokens_per_second` | float | Throughput from `completion_tokens / generation_window` |
| `metrics.provider_output_tokens_per_second_end_to_end` | float | Throughput from `completion_tokens / total_latency` |
| `metrics.visible_output_tokens_per_second` | float | Throughput from visible text token estimate |
| `metrics.sse_event_count` | int | Count of streamed SSE data events parsed |
| `metrics.reasoning_chunk_count` | int | Count of streamed chunks that contained `reasoning_content` |
| `metrics.content_chunk_count` | int | Count of streamed chunks that contained visible text |
| `metrics.token_visibility_ratio` | float | `visible_output_tokens_estimate / completion_tokens` |
| `tokens.completion_tokens` | int | Tokens generated (provider-reported) |
| `visible_output_tokens_estimate` | int | Estimated tokens in visible text (via word regex) |
| `response_preview` | string | First 500 characters of response |

## Queries

**Latest runs (last 10)**
```javascript
db.inference_runs.find().sort({ timestamp: -1 }).limit(10)
```

**Average metrics per model**
```javascript
db.inference_runs.aggregate([
  { $match: { ok: true, metrics_version: 4 } },
  { $group: {
    _id: "$model",
    avg_first_sse_event_ms: { $avg: "$metrics.first_sse_event_ms" },
    avg_first_reasoning_token_ms: { $avg: "$metrics.first_reasoning_token_ms" },
    avg_first_answer_token_ms: { $avg: "$metrics.first_answer_token_ms" },
    avg_ttft_ms: { $avg: "$metrics.ttft_ms" },
    avg_thinking_window_ms: { $avg: "$metrics.thinking_window_ms" },
    avg_time_to_completed_answer_ms: { $avg: "$metrics.time_to_completed_answer_ms" },
    avg_visible_tps: { $avg: "$metrics.visible_output_tokens_per_second" },
    avg_provider_tps_e2e: { $avg: "$metrics.provider_output_tokens_per_second_end_to_end" },
    count: { $sum: 1 }
  }}
])
```

**Error breakdown**
```javascript
db.inference_runs.aggregate([
  { $match: { ok: false } },
  { $group: { _id: "$error.type", count: { $sum: 1 } } }
])
```

## Indexes

The monitor creates these indexes automatically:

- `{ timestamp: 1 }`
- `{ model: 1, timestamp: 1 }`
- `{ ok: 1, timestamp: 1 }`
- `{ metrics_version: 1, timestamp: 1 }`
