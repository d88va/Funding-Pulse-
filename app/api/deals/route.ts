import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limit = Math.min(500, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 100));
  const rows = await q(
    `select company_name, round_stage, amount_text, amount_usd_m, amount_inr_cr, verified_amount, lead_investor,
            other_investors, sector, city, one_line_summary, source_urls, announced_week
     from deals order by announced_week desc, amount_usd_m desc nulls last, company_name limit $1`,
    [limit]
  );
  return NextResponse.json(rows);
}
