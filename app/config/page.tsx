import { loadConfig } from "@/lib/config";
import ConfigForm from "./ConfigForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your focus · Funding Pulse" };

function mask(email: string | null): string {
  if (!email) return "Not set";
  const [u, d] = email.split("@");
  return `${u.slice(0, 2)}${"•".repeat(Math.max(1, u.length - 2))}@${d}`;
}

export default async function ConfigPage() {
  const cfg = await loadConfig();
  return (
    <main>
      <p className="kicker">Settings</p>
      <h1>Your mandate.</h1>
      <p className="deck">Set what counts as a focus deal, who to watch, and what your portfolio does. The next brief follows these settings. No redeploy needed.</p>
      <p className="warn">This page has no password, so anyone with the link can change these settings. Keep the link to yourself.</p>
      <ConfigForm
        initial={{ sectors: cfg.sectors, stages: cfg.stages, watchlist: cfg.watchlist, portfolio: cfg.portfolio }}
        recipient={mask(process.env.RECIPIENT_EMAIL ?? cfg.recipient_email)}
      />
    </main>
  );
}
