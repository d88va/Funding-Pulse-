import { NextResponse } from "next/server";
import { extractStage } from "@/lib/extract";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Hobby plan maximum with Fluid compute

// Stage 2. Only unprocessed funding candidates cost Gemini calls, so repeated calls are harmless.
// If time runs out it returns remaining > 0; call it again to continue.
export async function POST() {
  try {
    return NextResponse.json(await extractStage());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
