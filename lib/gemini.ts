import { GoogleGenAI, type Schema } from "@google/genai";

// The only AI in this project: Gemini Flash via Google's official SDK.
// The model ID comes from the GEMINI_MODEL env var so it can be swapped without code changes.
let client: GoogleGenAI | null = null;

// Every request attempt (including retries) counts as one call; stages report the total in `runs`.
export const usage = { calls: 0 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.8-flash";
}

export async function geminiJSON<T>(system: string, prompt: string, schema: Schema): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey });

  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      usage.calls++;
      const res = await client.models.generateContent({
        model: geminiModel(),
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
      // Retry with exponential backoff on rate limits (429), server errors (5xx) and unreadable JSON.
      const retryable =
        status === 429 ||
        (status !== undefined && status >= 500) ||
        /429|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|fetch failed/i.test(msg) ||
        e instanceof SyntaxError;
      if (!retryable || attempt === 4) break;
      await sleep(2000 * 2 ** attempt + Math.random() * 500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
