# z.ai Inference Speed Monitor

A cron-friendly Python script that benchmarks z.ai's coding-plan API (`glm-5` model) via the OpenAI-compatible endpoint and logs performance metrics to MongoDB Atlas.

## What It Does

Runs 5 fixed prompts against z.ai, measuring:
- **TTFT** (Time to First Token): latency from request to first streamed output
- **Header Latency**: time to HTTP response headers
- **Total Latency**: end-to-end request duration
- **Throughput**: tokens/second (both provider-reported and visible text estimate)
- **Token Counts**: prompt, completion, and total tokens from provider
- **HTTP Status & Errors**: detailed error diagnostics

Results are persisted as JSON documents in MongoDB Atlas (`zaimonitor.inference_runs` by default).
Each document now includes `metrics_version=4`, where TTFT is first-any-token and answer completion metrics are explicit.

## Setup

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Environment
Copy and fill out `.env`:
```bash
cp .env.example .env
```

Required variables:
- `ZAI_API_KEY` – your z.ai coding-plan API key
- `ZAI_BASE_URL` – typically `https://api.z.ai/api/coding/paas/v4`
- `ZAI_MODEL` – e.g., `glm-5`
- `MONGODB_URI` – MongoDB Atlas connection string

Optional:
- `MONGO_DB`, `MONGO_COLLECTION` – defaults to `zaimonitor.inference_runs`
- `CONNECT_TIMEOUT_SECONDS` – default 15
- `STREAM_READ_TIMEOUT_SECONDS` – default 600 (enough for long generations)
- `LOG_PROGRESS` – set to `false` to suppress live JSON logs (default: true)

### 3. Run Manually
```bash
cd script && python3 monitor_zai_inference.py
```

Output: JSON progress events to stdout + final summary, plus documents inserted into MongoDB.

### 4. Inspect Raw Stream Chunks
To inspect chunk-level streaming behavior (including `reasoning_content`, `content`, and `tool_calls` deltas):

```bash
cd script && python3 inspect_stream_chunks.py --prompt "Explain TTFT in one sentence"
```

Probe for tool-call deltas:

```bash
cd script && python3 inspect_stream_chunks.py --with-tools --prompt "Call a tool to fetch latency policy for us-east-1"
```

## Cron Setup

Edit your crontab:
```bash
crontab -e
```

Example: run every hour at :30
```bash
30 * * * * cd /home/bieggerm/dev/zaimonitor/script && python3 monitor_zai_inference.py >> /tmp/zaimonitor.log 2>&1
```

Or with explicit env file:
```bash
30 * * * * cd /home/bieggerm/dev/zaimonitor/script && /usr/bin/python3 monitor_zai_inference.py
```

The script auto-loads `.env` from the working directory, so ensure you're in the project folder.

## MongoDB Schema

See [`script/MONGO.md`](script/MONGO.md) for the document structure and example queries.

## Architecture

- **Single script** – no dependencies on services or microframeworks
- **Streaming parser** – handles OpenAI-protocol SSE chunks robustly
- **Retry logic** – transient failures with exponential backoff
- **Defensive parsing** – gracefully handles missing/malformed fields
- **Progress logging** – optional JSON events per request for observability

## Prompts

The suite includes 5 diverse, solvable prompts:
1. Python palindrome checker (code generation)
2. JavaScript refactoring (code transformation)
3. JSON analytics (data processing with large input)
4. SQL query (structured query generation)
5. PR checklist (list generation)

Each is self-contained with all needed context, so the model doesn't ask for clarifications.

## Metrics Explanation

| Metric | Meaning |
|--------|---------|
| `header_latency_ms` | Time to receive HTTP headers (network + server queueing) |
| `first_sse_event_ms` | Time to first streamed `data:` event (even if no visible text yet) |
| `first_reasoning_token_ms` | Time to first streamed `reasoning_content` chunk |
| `first_answer_token_ms` | Time to first streamed answer `content` chunk |
| `ttft_ms` | Time to first streamed provider token (`reasoning_content` or `content`) |
| `thinking_window_ms` | Time from first reasoning chunk to first answer chunk |
| `time_to_completed_answer_ms` | Request start to completed answer stream (`[DONE]`) |
| `total_latency_ms` | Total request duration (everything from start to end) |
| `generation_window_ms` | Time from first answer token to completion |
| `provider_output_tokens_per_second` | Provider-reported completion_tokens ÷ generation window |
| `provider_output_tokens_per_second_end_to_end` | Provider-reported completion_tokens ÷ total_latency_ms |
| `visible_output_tokens_per_second` | Estimated tokens in actual returned text ÷ generation window |

Provider-reported TPS can be much higher than visible TPS when the provider token count includes non-visible/internal tokens (for example streamed reasoning tokens).

## Metric Semantics

- Timings are measured from the final attempt start when retries happen.
- `generation_window_ms` ends when stream completion is observed (`[DONE]` / stream end), not at `finish_reason`.
- Indexes are auto-created for dashboard workloads:
  - `{ timestamp: 1 }`
  - `{ model: 1, timestamp: 1 }`
  - `{ ok: 1, timestamp: 1 }`
  - `{ metrics_version: 1, timestamp: 1 }`

## Troubleshooting

**Script says env vars missing even though `.env` is set:**
- Ensure `.env` is in the working directory when you run the script.
- The script auto-loads it; no `export` or `source` needed.

**Requests timeout:**
- Check `STREAM_READ_TIMEOUT_SECONDS` – default 600s is plenty for most generations.
- If z.ai is slow, increase this value.

**MongoDB connection fails:**
- Verify `MONGODB_URI` and network access (IP allowlist in Atlas).
- Check credentials if Atlas username/password is in the URI.

**High TTFT or total latency:**
- Use `header_latency_ms` to separate network queueing from model streaming delay.
- If `header_latency_ms` is high, it's queueing at z.ai.
- If `header_latency_ms` is low but `ttft_ms` is high, model token emission is delayed.
- Compare `first_reasoning_token_ms` vs `first_answer_token_ms` to see reasoning-vs-answer gap.

## License

MIT (or your preferred license)
