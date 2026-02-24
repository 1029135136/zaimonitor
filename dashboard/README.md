# Dashboard

Next.js dashboard for data written by `script/monitor_zai_inference.py`.

## Views
- Current snapshot: latest TTFT and output TPS per model.
- Historical window: trends, failure markers, and aggregate KPIs.

## Run
```bash
cd dashboard
npm install
npm run dev
```

Required env:
- `MONGODB_URI`
- optional: `MONGO_DB` (`zaimonitor`)
- optional: `MONGO_COLLECTION` (`inference_runs`)

## Flow
1. `app/api/overview/route.ts` serves overview payload.
2. `lib/overview-query.ts` reads and aggregates Mongo.
3. `app/page.tsx` renders dashboard sections.
