import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);
const ENDPOINT_FAMILIES = new Set(["coding_plan", "official_api"]);

export const runtime = "nodejs";

function parseHours(raw: string | null): string {
  if (!raw) return "24";
  const normalized = raw.trim();
  if (normalized === "24" || normalized === "168") return normalized;
  return "24";
}

function parseModel(raw: string | null): string {
  if (!raw) return "";
  return raw.replace(/[^\w\-./]/g, "").slice(0, 120);
}

function parseEndpointFamily(raw: string | null): string {
  if (!raw) return "coding_plan";
  const normalized = raw.trim().toLowerCase().replace(/-/g, "_");
  if (ENDPOINT_FAMILIES.has(normalized)) {
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

    const root = path.resolve(process.cwd(), "..");
    const scriptPath = path.join(process.cwd(), "lib", "overview_query.py");
    const venvPython = path.join(root, "script", ".venv", "bin", "python");
    const pythonBin = process.env.DASHBOARD_PYTHON_BIN || (fs.existsSync(venvPython) ? venvPython : "python3");

    const args = [scriptPath, "--hours", hours, "--endpoint-family", endpointFamily];
    if (model) {
      args.push("--model", model);
    }

    const { stdout } = await execFileAsync(pythonBin, args, {
      env: process.env,
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    });

    const payload = JSON.parse(stdout);
    if (payload?.error) {
      return NextResponse.json(payload, { status: 500 });
    }

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
