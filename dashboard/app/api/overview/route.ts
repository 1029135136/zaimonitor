import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

function parseHours(raw: string | null): string {
  if (!raw) return "24";
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "24";
  return String(n);
}

function parseModel(raw: string | null): string {
  if (!raw) return "";
  return raw.replace(/[^\w\-./]/g, "").slice(0, 120);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const hours = parseHours(url.searchParams.get("hours"));
    const model = parseModel(url.searchParams.get("model"));

    const root = path.resolve(process.cwd(), "..");
    const scriptPath = path.join(process.cwd(), "lib", "overview_query.py");
    const venvPython = path.join(root, "script", ".venv", "bin", "python");
    const pythonBin = process.env.DASHBOARD_PYTHON_BIN || (fs.existsSync(venvPython) ? venvPython : "python3");

    const args = [scriptPath, "--hours", hours];
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
