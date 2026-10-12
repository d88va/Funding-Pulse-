import { Resend } from "resend";
import { q } from "./db";
import { loadConfig, recipientEmail } from "./config";
import { reportWeek } from "./patterns";

// Resend's free tier without a verified domain only sends from onboarding@resend.dev, and only to the
// email address of the Resend account owner. That is fine here: Aarav's inbox is the account owner's.
const FROM = "Funding Pulse <onboarding@resend.dev>";

export type SendResult = { status: string; to: string | null };

export async function sendBrief(subject: string, html: string, weekStart: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const to = recipientEmail() ?? (await loadConfig()).recipient_email;
  if (!key || !to) {
    const status = !key ? "failed: RESEND_API_KEY is not set" : "failed: no recipient email";
    await q("update briefs set email_status = $1 where week_start = $2::date", [status, weekStart]);
    return { status, to };
  }
  let status: string;
  try {
    const { data, error } = await new Resend(key).emails.send({ from: FROM, to: [to], subject, html });
    status = error ? `failed: ${error.message}` : `sent (${data?.id ?? "no id"})`;
  } catch (e) {
    status = `failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  await q(
    "update briefs set email_status = $1, sent_at = case when $1 like 'sent%' then now() else sent_at end where week_start = $2::date",
    [status, weekStart]
  );
  return { status, to };
}

// Re-send the stored brief without rebuilding it. Used by the "Send test brief" button.
export async function resendLatest(): Promise<SendResult & { weekStart: string }> {
  const weekStart = reportWeek();
  const [b] = await q<{ html: string }>("select html from briefs where week_start = $1::date", [weekStart]);
  if (!b?.html) return { weekStart, status: "failed: no brief built yet", to: null };
  const subject = `Funding Pulse (test copy) — week of ${new Date(weekStart + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
  return { weekStart, ...(await sendBrief(subject, b.html, weekStart)) };
}
