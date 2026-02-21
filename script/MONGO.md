# MongoDB Schema: `inference_runs`

**Database:** `zaimonitor` (configurable via `MONGO_DB`)  
**Collection:** `inference_runs` (configurable via `MONGO_COLLECTION`)

## Document Structure

```json
{
  "run_id": "uuid",
  "request_id": "uuid",
  "timestamp": "ISO 8601 datetime",
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
    "ttft_ms": 1200,
    "total_latency_ms": 2100,
    "generation_window_ms": 900,
    "provider_output_tokens_per_second": 45.5,
    "visible_output_tokens_per_second": 42.1,
    "output_chars_per_second": 210.5
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
| `ok` | boolean | Success (true) or failure (false) |
| `metrics.header_latency_ms` | float | Time to HTTP response headers |
| `metrics.ttft_ms` | float | Time to first streamed token (null if failed) |
| `metrics.total_latency_ms` | float | Request start to completion |
| `metrics.generation_window_ms` | float | TTFT to last token (useful for throughput) |
| `metrics.provider_output_tokens_per_second` | float | Throughput from `completion_tokens / generation_window` |
| `metrics.visible_output_tokens_per_second` | float | Throughput from visible text token estimate |
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
  { $match: { ok: true } },
  { $group: {
    _id: "$model",
    avg_ttft_ms: { $avg: "$metrics.ttft_ms" },
    avg_visible_tps: { $avg: "$metrics.visible_output_tokens_per_second" },
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
