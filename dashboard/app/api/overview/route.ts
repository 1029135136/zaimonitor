import { NextResponse } from "next/server";
import { queryOverview, OverviewQueryParams } from "@/lib/overview-query";

export const runtime = "nodejs";

function parseHours(raw: string | null): number {
  if (!raw) return 24;
  const normalized = raw.trim();
  if (normalized === "24" || normalized === "168") {
    return Number(normalized);
  }
  return 24;
}

function parseModel(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^\w\-./]/g, "").slice(0, 120);
  return cleaned || undefined;
}

function parseEndpointFamily(raw: string | null): string {
  if (!raw) return "coding_plan";
  const normalized = raw.trim().toLowerCase().replace(/-/g, "_");
  if (normalized === "coding_plan" || normalized === "official_api") {
    return normalized;
  }
  return "coding_plan";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const hours = parseHours(url.searchParams.get("hours"));
    const model = parseModel(url.searchParams.get("model"));
    const endpointFamily = parseEndpointFamily(url.searchParams.get("endpoint_family"));

    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      return NextResponse.json({ error: "MONGODB_URI is required" }, { status: 500 });
    }

    const params: OverviewQueryParams = {
      hours,
      model,
      endpointFamily,
    };

    const payload = await queryOverview(mongoUri, params);

    return NextResponse.json(payload, {
      headers: {
        "cache-control": "private, max-age=0, s-maxage=60, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Failed to fetch overview";
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
