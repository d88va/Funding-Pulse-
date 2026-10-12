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
const NUMBER_WORDS =
  /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|twice|doubl\w*|tripl\w*|quadrupl\w*|halv\w*|half|hundred|thousand)\b/i;

// With no earlier weeks on record, any claim of movement would be invented, so trend words are refused.
const TREND_WORDS = /\b(rose|rise|risen|fell|fall|grew|growth|surged?|jumped?|dropped?|increased?|decreased?|declined?|up from|down from|compared with|versus|vs\.?)\b/i;

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
  const baseline = (stats as { sector_change_vs_prev_weeks?: { baseline?: boolean } } | null)?.sector_change_vs_prev_weeks?.baseline;
  const trend = baseline ? text.match(TREND_WORDS) : null;
  if (trend) bad.push(`${trend[0]} (no earlier weeks to compare with)`);
  return { ok: bad.length === 0, bad };
}
