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
