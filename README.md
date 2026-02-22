# z.ai Monitor

Lightweight benchmarking + dashboard for z.ai inference performance.

## Components
- `script/` runs benchmark prompts, streams responses, and writes run docs to MongoDB.
- `dashboard/` is a Next.js + shadcn UI for at-a-glance KPIs and trends.
- Metric schema and query examples: `script/MONGO.md`.

## Endpoint Families
- `coding_plan`: `https://api.z.ai/api/coding/paas/v4`
- `official_api`: `https://api.z.ai/api/paas/v4` (`/chat/completions` path is appended by the collector)
- Models collected for each endpoint family: `glm-5`, `glm-4.7`

## Quick Start
1. Collector setup
```bash
cd script
cp .env.example .env
pip install -r requirements.txt
export ZAI_ENDPOINT_FAMILY=coding_plan
export ZAI_BASE_URL=https://api.z.ai/api/coding/paas/v4
export ZAI_MODEL=glm-5
python3 monitor_zai_inference.py
```

2. Dashboard setup
```bash
cd dashboard
npm install
npm run dev
```

## Scheduler
Run the collector on `:30` (cron). The dashboard can pull shortly after completion.

The GitHub workflow runs 4 executions every cycle:
- coding_plan + glm-5
- coding_plan + glm-4.7
- official_api + glm-5
- official_api + glm-4.7

Example:
```bash
30 * * * * cd /home/bieggerm/dev/zaimonitor/script && python3 monitor_zai_inference.py >> /tmp/zaimonitor.log 2>&1
```

## Metrics (v4)
- `ttft_ms`: time to first streamed provider token (`reasoning_content` or `content`).
- `output_tokens_per_second_post_ttft`: `(completion_tokens - 1) / (total_latency_ms - ttft_ms)`.
- `first_answer_token_ms`: time to first answer `content` token.
- `time_to_completed_answer_ms`: request start to completed answer stream.

For full schema/details, use `script/MONGO.md`.
