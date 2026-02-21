# ZAI Monitor Dashboard

Next.js dashboard for visualizing inference metrics written by `script/monitor_zai_inference.py`.

## What it shows

- TTFT and first-SSE timing
- Visible TPS vs provider-reported TPS
- Success/failure rates and p95 total latency
- Schedule status (`:30` each hour, UTC)

## Data flow

1. `app/api/overview/route.ts` handles browser requests.
2. The route executes `lib/overview_query.py`.
3. The Python helper reads MongoDB via `pymongo` and returns JSON.
4. `app/page.tsx` renders overview panels and refreshes every 5 minutes.

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
- optional: `DASHBOARD_PYTHON_BIN` (explicit Python path for `overview_query.py`)

If `DASHBOARD_PYTHON_BIN` is not set, the route tries `../script/.venv/bin/python`, then `python3`.

## Structure

- `app/page.tsx`: page orchestration, polling, filter state
- `app/api/overview/route.ts`: API endpoint for overview payload
- `components/overview-*.tsx`: presentational sections
- `lib/overview-types.ts`: shared response types
- `lib/overview-format.ts`: time/metric formatting helpers
- `lib/overview-chart.ts`: SVG path generation
- `lib/overview_query.py`: Mongo aggregation helper
