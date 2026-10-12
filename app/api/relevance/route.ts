import { NextResponse } from "next/server";
import { relevanceStage } from "@/lib/relevance";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Stage 4. ?redo=1 forgets earlier adjacency judgements (use after changing the portfolio list).
export async function POST(req: Request) {
  try {
    const redo = new URL(req.url).searchParams.get("redo") === "1";
    return NextResponse.json(await relevanceStage({ redo }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
