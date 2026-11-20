export const BE_OFFSET = 543;

export const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
] as const;

export const THAI_MONTHS_FULL = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const;

export interface IsoDateParts {
  year: number;
  month: number;
  day: number;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

/**
 * Parses a strict YYYY-MM-DD date string and verifies calendar validity
 * (rejects invalid dates such as 2026-02-30).
 */
export function parseIsoDateParts(isoDate: string): IsoDateParts | null {
  const trimmed = isoDate.trim();
  const match = ISO_DATE_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!isValidCalendarDate(year, month, day)) {
    return null;
  }

  return { year, month, day };
}

/**
 * Normalizes a YYYY-MM-DD date string to Christian Era (CE / ค.ศ.).
 * If a Buddhist Era year (year >= 2400, e.g. 2569) is passed, converts by subtracting 543.
 */
export function normalizeToIsoCeDate(
  input: string | null | undefined,
): string | null {
  if (!input) {
    return null;
  }
  const trimmed = input.trim();
  const match = ISO_DATE_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }

  const rawYear = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const ceYear = rawYear >= 2400 ? rawYear - BE_OFFSET : rawYear;
  if (ceYear < 1900 || ceYear > 2200 || !isValidCalendarDate(ceYear, month, day)) {
    return null;
  }

  return `${String(ceYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Formats an ISO YYYY-MM-DD (CE) date string into Thai Buddhist Era format.
 */
export function formatThaiDate(
  isoDate: string | null | undefined,
  style: "short" | "long" = "short",
): string {
  if (!isoDate) {
    return "ไม่ระบุวันปิดรับสมัคร";
  }

  const normalized = normalizeToIsoCeDate(isoDate);
  if (!normalized) {
    return "ไม่ระบุวันปิดรับสมัคร";
  }

  const parts = parseIsoDateParts(normalized);
  if (!parts) {
    return "ไม่ระบุวันปิดรับสมัคร";
  }

  const beYear = parts.year + BE_OFFSET;
  const monthList = style === "long" ? THAI_MONTHS_FULL : THAI_MONTHS_SHORT;
  const monthLabel = monthList[parts.month - 1];

  return `${parts.day} ${monthLabel} ${beYear}`;
}

/**
 * Returns today's YYYY-MM-DD date string in Asia/Bangkok timezone.
 */
export function getTodayIsoBangkok(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  if (!year || !month || !day) {
    return now.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

export interface ThaiDateContext {
  ceDate: string;
  ceYear: number;
  beYear: number;
  thaiReadable: string;
}

/**
 * Builds today's date context (both CE and BE) for AI prompt injection.
 */
export function getCurrentThaiDateContext(
  now: Date = new Date(),
): ThaiDateContext {
  const ceDate = getTodayIsoBangkok(now);
  const parts = parseIsoDateParts(ceDate);
  const ceYear = parts ? parts.year : now.getUTCFullYear();
  const beYear = ceYear + BE_OFFSET;
  const thaiReadable = formatThaiDate(ceDate, "long");

  return {
    ceDate,
    ceYear,
    beYear,
    thaiReadable,
  };
}

export type DeadlineCountdown =
  | { kind: "none"; daysRemaining: null; label: string }
  | { kind: "expired"; daysRemaining: number; label: string }
  | { kind: "today"; daysRemaining: 0; label: string }
  | { kind: "urgent"; daysRemaining: number; label: string }
  | { kind: "upcoming"; daysRemaining: number; label: string };

/**
 * Calculates calendar-day difference in UTC (no local DST/timezone drift).
 */
export function getDeadlineCountdown(
  isoDeadline: string | null | undefined,
  referenceIsoDate?: string,
): DeadlineCountdown {
  const normalizedDeadline = normalizeToIsoCeDate(isoDeadline);
  if (!normalizedDeadline) {
    return { kind: "none", daysRemaining: null, label: "ไม่ระบุกำหนดปิดรับ" };
  }

  const deadlineParts = parseIsoDateParts(normalizedDeadline);
  if (!deadlineParts) {
    return { kind: "none", daysRemaining: null, label: "ไม่ระบุกำหนดปิดรับ" };
  }

  const todayIso =
    normalizeToIsoCeDate(referenceIsoDate) ?? getTodayIsoBangkok();
  const todayParts = parseIsoDateParts(todayIso);
  if (!todayParts) {
    return { kind: "none", daysRemaining: null, label: "ไม่ระบุกำหนดปิดรับ" };
  }

  const msPerDay = 86_400_000;
  const deadlineUtc = Date.UTC(
    deadlineParts.year,
    deadlineParts.month - 1,
    deadlineParts.day,
  );
  const todayUtc = Date.UTC(
    todayParts.year,
    todayParts.month - 1,
    todayParts.day,
  );
  const diffDays = Math.round((deadlineUtc - todayUtc) / msPerDay);

  if (diffDays < 0) {
    return {
      kind: "expired",
      daysRemaining: diffDays,
      label: `ปิดรับแล้ว ${Math.abs(diffDays)} วัน`,
    };
  }
  if (diffDays === 0) {
    return {
      kind: "today",
      daysRemaining: 0,
      label: "ปิดรับสมัครวันนี้",
    };
  }
  if (diffDays <= 7) {
    return {
      kind: "urgent",
      daysRemaining: diffDays,
      label: `เหลืออีก ${diffDays} วัน`,
    };
  }
  return {
    kind: "upcoming",
    daysRemaining: diffDays,
    label: `อีก ${diffDays} วัน`,
  };
}
