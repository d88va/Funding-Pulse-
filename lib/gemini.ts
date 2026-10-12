import { GoogleGenAI, type Schema } from "@google/genai";

// The only AI in this project: Gemini Flash via Google's official SDK.
// The model ID comes from the GEMINI_MODEL env var so it can be swapped without code changes.
let client: GoogleGenAI | null = null;

// Every request attempt (including retries) counts as one call; stages report the total in `runs`.
export const usage = { calls: 0 };

// Free-tier Flash allows about 5 requests a minute, so requests are spaced out on purpose.
// Override with GEMINI_MIN_INTERVAL_MS if your key has a higher limit.
const MIN_GAP_MS = Number(process.env.GEMINI_MIN_INTERVAL_MS) || 12500;
let nextSlot = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Thrown when the daily quota is used up. Retrying would only waste more requests, so callers stop.
export class QuotaError extends Error {}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.8-flash";
}

// Free-tier quotas are per model. If the main model runs out for the day, the next Flash model in this
// list takes over, so a brief still gets built. Override with GEMINI_FALLBACK_MODELS (comma separated).
function modelChain(): string[] {
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS || "gemini-3.6-flash,gemini-3.5-flash,gemini-3.1-flash-lite")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [geminiModel(), ...fallbacks.filter((m) => m !== geminiModel())];
}

const exhausted = new Set<string>(); // models whose daily quota is used up, within this server instance

async function paced() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS;
  if (wait > 0) await sleep(wait);
}

export async function geminiJSON<T>(system: string, prompt: string, schema: Schema): Promise<T> {
  let lastQuota: QuotaError | null = null;
  for (const model of modelChain()) {
    if (exhausted.has(model)) continue;
    try {
      return await geminiJSONWith<T>(model, system, prompt, schema);
    } catch (e) {
      if (!(e instanceof QuotaError)) throw e;
      exhausted.add(model);
      lastQuota = e;
    }
  }
  throw lastQuota ?? new QuotaError("All configured Gemini Flash models have used their daily free quota.");
}

async function geminiJSONWith<T>(model: string, system: string, prompt: string, schema: Schema): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey });

  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await paced();
      usage.calls++;
      const res = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0,
        },
      });
      if (!res.text) throw new Error("Empty response from Gemini");
      return JSON.parse(res.text) as T;
    } catch (e) {
      lastError = e;
      const status = (e as { status?: number }).status;
      const msg = e instanceof Error ? e.message : String(e);

      // Daily quota exhausted: stop immediately and say so plainly.
      if (/PerDay/i.test(msg)) {
        throw new QuotaError(
          `Gemini daily free quota used up for ${model}. It resets at midnight Pacific time.`
        );
      }

      // Retry with exponential backoff on per-minute limits (429), server errors (5xx) and unreadable JSON.
      const retryable =
        status === 429 ||
        (status !== undefined && status >= 500) ||
        /429|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|fetch failed/i.test(msg) ||
        e instanceof SyntaxError;
      if (!retryable || attempt === 3) break;

      const hinted = msg.match(/retry in ([\d.]+)s/i);
      const backoff = hinted ? Number(hinted[1]) * 1000 + 1000 : 3000 * 2 ** attempt;
      await sleep(Math.min(backoff, 45000) + Math.random() * 500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
