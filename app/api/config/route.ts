import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { loadConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

const list = (v: unknown, max = 60): string[] =>
  Array.isArray(v)
    ? v
        .map((x) => String(x).trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, max)
    : [];

export async function GET() {
  return NextResponse.json(await loadConfig());
}

// Saves Aarav's mandate. The next run uses it immediately, with no redeploy.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const portfolio = Array.isArray(body.portfolio)
    ? body.portfolio
        .map((p: { name?: unknown; description?: unknown }) => ({
          name: String(p?.name ?? "").trim().slice(0, 80),
          description: String(p?.description ?? "").trim().slice(0, 240),
        }))
        .filter((p: { name: string }) => p.name)
        .slice(0, 30)
    : [];

  await q(
    `update config set sectors = $1, stages = $2, watchlist = $3, portfolio = $4::jsonb, updated_at = now() where id = 1`,
    [list(body.sectors), list(body.stages), list(body.watchlist), JSON.stringify(portfolio)]
  );
  return NextResponse.json(await loadConfig());
}
