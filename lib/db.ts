import { neon } from "@neondatabase/serverless";

// One shared connection helper. Every database call in the app goes through q().
// DATABASE_URL is read on the server only, so it never reaches the browser.
let sql: ReturnType<typeof neon> | null = null;

export async function q<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  sql ??= neon(url);
  const rows = await sql.query(text, params);
  return rows as unknown as T[];
}

// Columns added after the first schema. Safe to call repeatedly, so a fresh
// database or an old one both end up with the same shape without a manual step.
export async function ensureSchema(): Promise<void> {
  await q("alter table articles add column if not exists extraction jsonb");
  await q("alter table articles add column if not exists normalized boolean not null default false");
}
