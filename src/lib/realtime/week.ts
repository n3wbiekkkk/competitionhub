import { formatThaiDate, parseIsoDateParts } from "@/lib/utils/thai-date";

const DAY_MS = 86_400_000;

/** Monday-based week start in CE YYYY-MM-DD form, using UTC calendar math. */
export function getWeekStartIso(isoDate: string): string {
  const parts = parseIsoDateParts(isoDate);
  if (!parts) return isoDate.slice(0, 10);
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const mondayOffset = (utc.getUTCDay() + 6) % 7;
  return new Date(utc.getTime() - mondayOffset * DAY_MS).toISOString().slice(0, 10);
}

export function formatWeekRangeTh(weekStart: string): string {
  const parts = parseIsoDateParts(weekStart);
  if (!parts) return "ไม่ระบุสัปดาห์";
  const monday = Date.UTC(parts.year, parts.month - 1, parts.day);
  const sunday = new Date(monday + 6 * DAY_MS).toISOString().slice(0, 10);
  return `${formatThaiDate(weekStart, "short")} – ${formatThaiDate(sunday, "short")}`;
}
