import { q } from "./db";

export type PortfolioCompany = { name: string; description: string };

export type Config = {
  sectors: string[];
  stages: string[];
  watchlist: string[];
  portfolio: PortfolioCompany[];
  recipient_email: string | null;
};

export async function loadConfig(): Promise<Config> {
  const [c] = await q<Config>("select sectors, stages, watchlist, portfolio, recipient_email from config where id = 1");
  return c ?? { sectors: [], stages: [], watchlist: [], portfolio: [], recipient_email: null };
}

// The brief goes to RECIPIENT_EMAIL from the environment. On Resend's free tier mail can only go to the
// account owner anyway, and keeping it out of the public config page means nobody can redirect the brief.
export function recipientEmail(): string | null {
  return process.env.RECIPIENT_EMAIL || null;
}
