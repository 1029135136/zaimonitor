# z.ai Monitor

Lightweight benchmarking + dashboard for z.ai inference performance.

## Components
- `script/` runs benchmark prompts, streams responses, and writes run docs to MongoDB.
- `dashboard/` is a Next.js + shadcn UI for at-a-glance KPIs and trends.
- Metric schema and query examples: `script/MONGO.md`.

## Quick Start
1. Collector setup
```bash
cd script
cp .env.example .env
pip install -r requirements.txt
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

Example:
```bash
30 * * * * cd /home/bieggerm/dev/zaimonitor/script && python3 monitor_zai_inference.py >> /tmp/zaimonitor.log 2>&1
```

## Metrics (v4)
- `ttft_ms`: time to first streamed provider token (`reasoning_content` or `content`).
- `first_answer_token_ms`: time to first answer `content` token.
- `time_to_completed_answer_ms`: request start to completed answer stream.

For full schema/details, use `script/MONGO.md`.
