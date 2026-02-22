# MongoDB Schema: `inference_runs`

**Database:** `zaimonitor` (configurable via `MONGO_DB`)  
**Collection:** `inference_runs` (configurable via `MONGO_COLLECTION`)

## Document Structure

```json
{
  "timestamp": "ISO 8601 datetime",
  "metrics_version": 4,
  "run_id": "UUID shared by all prompts in one benchmark run",
  "endpoint_family": "coding_plan",
  "endpoint_base": "https://api.z.ai/api/coding/paas/v4",
  "model": "glm-5",
  "ok": true,
  "metrics": {
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
    "output_tokens_per_second_post_ttft": 40.2,
    "visible_output_tokens_per_second": 42.1
  },
  "tokens": {
    "completion_tokens": 150,
    "cached_prompt_tokens": 80
  },
  "error": {
    "type": null
  }
}
```

## Key Fields

| Field | Type | Notes |
|-------|------|-------|
| `metrics_version` | int | Metric semantics version (`4` = TTFT is first any token + explicit answer-completion metrics) |
| `run_id` | string | Shared ID across all prompts from one script execution (used for run-level trend points) |
| `endpoint_family` | string | Endpoint grouping used for dashboard split (`coding_plan` or `official_api`) |
| `endpoint_base` | string | Concrete base URL used for this request family |
| `ok` | boolean | Success (true) or failure (false) |
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
| `metrics.output_tokens_per_second_post_ttft` | float | Throughput from `(completion_tokens - 1) / (total_latency - ttft)` |
| `metrics.visible_output_tokens_per_second` | float | Throughput from visible text token estimate |
| `tokens.completion_tokens` | int | Tokens generated (provider-reported) |
| `tokens.cached_prompt_tokens` | int | Cache-hit prompt tokens from `usage.prompt_tokens_details.cached_tokens` |

## Queries

**Latest runs (last 10)**
```javascript
db.inference_runs.find().sort({ timestamp: -1 }).limit(10)
```

**Average metrics per model + endpoint family**
```javascript
db.inference_runs.aggregate([
  { $match: { ok: true, metrics_version: 4 } },
  { $group: {
    _id: { endpoint_family: "$endpoint_family", model: "$model" },
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

**Average cached prompt tokens per run**
```javascript
db.inference_runs.aggregate([
  { $match: { metrics_version: 4, "tokens.cached_prompt_tokens": { $ne: null } } },
  { $group: {
    _id: { endpoint_family: "$endpoint_family", model: "$model" },
    avg_cached_prompt_tokens: { $avg: "$tokens.cached_prompt_tokens" },
    count: { $sum: 1 }
  }}
])
```

**Coding Plan endpoint only**
```javascript
db.inference_runs.find({ endpoint_family: "coding_plan" }).sort({ timestamp: -1 }).limit(20)
```

**Official API endpoint only**
```javascript
db.inference_runs.find({ endpoint_family: "official_api" }).sort({ timestamp: -1 }).limit(20)
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
- `{ endpoint_family: 1, timestamp: 1 }`
- `{ endpoint_family: 1, model: 1, timestamp: 1 }`
- `{ ok: 1, timestamp: 1 }`
- `{ run_id: 1, timestamp: 1 }`
- `{ metrics_version: 1, timestamp: 1 }`

## Legacy `run_id` Backfill

For older docs without `run_id`, use:

```bash
cd script
python3 backfill_run_ids.py
```

Dry-run prints:
- how many legacy docs were found
- how many inferred run clusters were created
- cluster-size histogram (you should mostly see size `3`)
- preview of generated synthetic `run_id` values

If the dry-run looks right, apply updates:

```bash
cd script
python3 backfill_run_ids.py --apply
```

Optional tuning:
- `--expected-prompts 3` (default)
- `--max-gap-seconds 600` (default 10 minutes between docs in same inferred run)
