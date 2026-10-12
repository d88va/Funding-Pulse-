// THE CUT, part two. Gemini may only describe counts that code already computed.
// Every number in its sentences must be a number that exists in the stats JSON, or the text is thrown away.

// Collects every numeric value in the stats. Numbers hidden inside strings (dates, names) are deliberately
// NOT collected, so a made-up "10 deals" cannot sneak through by matching a date like 2026-10-05.
export function statsNumbers(stats: unknown): Set<number> {
  const found = new Set<number>();
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) {
      found.add(v);
      found.add(Math.abs(v)); // "fell 20%" may be written without the minus sign
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(stats);
  return found;
}

// Spelled-out numbers can't be checked as digits, so they are not allowed either.
const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|twice|double|triple|half|hundred|thousand)\b/i;

export type NumberCheck = { ok: boolean; bad: string[] };

export function checkNumbers(text: string, stats: unknown): NumberCheck {
  const allowed = statsNumbers(stats);
  const bad: string[] = [];
  for (const m of text.match(/\d+(?:,\d{3})*(?:\.\d+)?/g) ?? []) {
    const n = Number(m.replace(/,/g, ""));
    if (!allowed.has(n)) bad.push(m);
  }
  const word = text.match(NUMBER_WORDS);
  if (word) bad.push(word[0]);
  return { ok: bad.length === 0, bad };
}
