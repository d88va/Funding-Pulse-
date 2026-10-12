// THE CUT (Check 06). Everything in this file is plain code. No AI decides a number.

export const FX_USD_INR = () => Number(process.env.FX_USD_INR) || 84;

// Case- and whitespace-insensitive, so "Rs  25 Crore" matches "rs 25 crore".
export function squash(s: string): string {
  return s.toLowerCase().replace(/[\s ]+/g, " ").trim();
}

export type Parsed = { value: number; unit: Unit; currency: "INR" | "USD" };
type Unit = "crore" | "lakh" | "thousand" | "million" | "billion" | "one";

const MULTIPLIER: Record<Unit, number> = {
  crore: 1e7, // 1 crore = 10 million rupees
  lakh: 1e5, // 1 lakh = 100 thousand rupees
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
  one: 1,
};

// Reads currency, number and unit out of the verbatim span ("Rs 25 crore", "$5.5M").
export function parseAmount(span: string): Parsed | null {
  const currency = /₹|\brs(?=[.\s\d])|\binr\b|\brupees?\b/i.test(span)
    ? "INR"
    : /\$|\busd\b|\bus\s?dollars?\b|\bdollars?\b/i.test(span)
      ? "USD"
      : null;
  if (!currency) return null;

  const m = span.match(/(\d[\d,]*(?:\.\d+)?)\s*[-\s]?\s*([a-z]+)?/i);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;

  const word = (m[2] ?? "").toLowerCase();
  let unit: Unit = "one";
  if (/^(crores?|cr)$/.test(word)) unit = "crore";
  else if (/^(lakhs?|lacs?|lac)$/.test(word)) unit = "lakh";
  else if (/^(million|mn|m)$/.test(word)) unit = "million";
  else if (/^(billion|bn|b)$/.test(word)) unit = "billion";
  else if (/^(thousand|k)$/.test(word)) unit = "thousand";
  return { value, unit, currency };
}

export function convert(p: Parsed): { usdM: number; inrCr: number } {
  const fx = FX_USD_INR();
  const raw = p.value * MULTIPLIER[p.unit];
  const inr = p.currency === "INR" ? raw : raw * fx;
  const usd = p.currency === "USD" ? raw : raw / fx;
  return { usdM: round(usd / 1e6), inrCr: round(inr / 1e7) };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export type Verification = {
  ok: boolean;
  reason: string;
  claimed: string | null;
  parsed?: Parsed;
  usdM?: number;
  inrCr?: number;
};

// An amount is accepted only if (1) the exact span appears in the article text and
// (2) code can read a currency and number from that span. Otherwise it is "undisclosed".
export function verifyAmount(
  claimed: string | null | undefined,
  articleText: string,
  geminiValue?: number | null
): Verification {
  if (!claimed || !claimed.trim()) return { ok: false, reason: "no amount stated", claimed: null };
  if (!squash(articleText).includes(squash(claimed)))
    return { ok: false, reason: "span not found in the article text", claimed };

  const parsed = parseAmount(claimed);
  if (!parsed) return { ok: false, reason: "could not read a currency and number from the span", claimed };
  if (geminiValue != null && Math.abs(geminiValue - parsed.value) > 1e-9)
    return { ok: false, reason: "Gemini's number disagrees with the span", claimed, parsed };

  const { usdM, inrCr } = convert(parsed);
  if (usdM <= 0 || usdM > 50000) return { ok: false, reason: "amount outside a believable range", claimed, parsed };
  return { ok: true, reason: "verified", claimed, parsed, usdM, inrCr };
}

// "Zepto Pvt. Ltd." and "Zepto" become the same key, so one deal reported twice merges.
export function companyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(pvt|private|ltd|limited|technologies|technology|inc|llp)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

// Monday of the week (IST) for a timestamp, as YYYY-MM-DD. Deals are grouped by this week.
export function mondayOf(d: Date | string): string {
  const ist = new Date(new Date(d).getTime() + 5.5 * 60 * 60 * 1000);
  const back = (ist.getUTCDay() + 6) % 7;
  return new Date(ist.getTime() - back * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
