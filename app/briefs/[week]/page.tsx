import Link from "next/link";
import { notFound } from "next/navigation";
import BriefView from "@/components/BriefView";

export const dynamic = "force-dynamic";

export default async function BriefPage({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) notFound();
  const brief = await BriefView({ week });
  if (!brief) notFound();
  return (
    <main>
      <p className="kicker"><Link href="/briefs">← Past briefs</Link></p>
      {brief}
    </main>
  );
}
