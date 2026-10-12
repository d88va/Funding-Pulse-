import Link from "next/link";
import { notFound } from "next/navigation";
import { q } from "@/lib/db";
import { bodyOf } from "@/lib/briefHtml";

export const dynamic = "force-dynamic";

export default async function BriefPage({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) notFound();
  const [b] = await q<{ html: string }>("select html from briefs where week_start = $1::date and html <> ''", [week]);
  if (!b) notFound();
  return (
    <main>
      <p style={{ marginTop: 28 }}><Link href="/briefs" className="hint">← All briefs</Link></p>
      <div className="brief" dangerouslySetInnerHTML={{ __html: bodyOf(b.html) }} />
    </main>
  );
}
