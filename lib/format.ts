// "6 Oct 2026": the Monday of the current week, in IST.
export function weekOfLabel(now = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const back = (ist.getUTCDay() + 6) % 7; // days since Monday
  const monday = new Date(ist.getTime() - back * 24 * 60 * 60 * 1000);
  return monday.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// Database timestamps can arrive as Date objects or strings; show them in IST.
export function fmtIST(d: string | Date | null | undefined): string {
  if (!d) return "never";
  return new Date(d).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
