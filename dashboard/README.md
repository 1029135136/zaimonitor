# ZAI Monitor Dashboard

Next.js dashboard for visualizing inference metrics written by `script/monitor_zai_inference.py`.

## What it shows

- TTFT and first-SSE timing
- Visible TPS vs provider-reported TPS
- Success/failure rates and p95 TTFT
- Side-by-side Coding Plan vs Normal API comparison in KPI cards and trend lines
- Avg cached prompt tokens per run (from `usage.prompt_tokens_details.cached_tokens`)
- Schedule status (`:30` each hour, UTC)

## Data flow

1. `app/api/overview/route.ts` handles browser requests.
2. The route calls `lib/overview-query.ts` which aggregates MongoDB data.
3. `app/page.tsx` renders overview panels and refetches on page load and filter changes.

## Run locally

From `dashboard/`:

```bash
npm install
npm run dev
```

Environment required by the API route:

- `MONGODB_URI`
- optional: `MONGO_DB` (default `zaimonitor`)
- optional: `MONGO_COLLECTION` (default `inference_runs`)

## Structure

- `app/page.tsx`: page orchestration and filter state
- `app/api/overview/route.ts`: API endpoint for overview payload
- `components/overview-*.tsx`: presentational sections
- `lib/overview-types.ts`: shared response types
- `lib/overview-format.ts`: time/metric formatting helpers
- `lib/overview-chart.ts`: SVG path generation
- `lib/overview-query.ts`: MongoDB aggregation helper
