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
