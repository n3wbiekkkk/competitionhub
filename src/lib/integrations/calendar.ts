import { parseIsoDateParts } from "@/lib/utils/thai-date";

export interface CalendarEventInput {
  uid: string;
  title: string;
  startDate: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  categories?: readonly string[];
}

export interface BuildIcsCalendarInput {
  events: readonly CalendarEventInput[];
  calendarName?: string;
  generatedAt?: Date;
}

/** RFC 5545 all-day DATE value. Returns null for invalid CE dates. */
export function formatIcsDate(isoDate: string): string | null {
  const parts = parseIsoDateParts(isoDate);
  if (!parts) return null;
  return `${String(parts.year).padStart(4, "0")}${String(parts.month).padStart(2, "0")}${String(parts.day).padStart(2, "0")}`;
}

/** DTEND for an all-day event is exclusive, so use the following UTC day. */
export function formatIcsNextDate(isoDate: string): string | null {
  const parts = parseIsoDateParts(isoDate);
  if (!parts) return null;
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return `${String(next.getUTCFullYear()).padStart(4, "0")}${String(next.getUTCMonth() + 1).padStart(2, "0")}${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function formatIcsUtcStamp(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}${String(date.getUTCSeconds()).padStart(2, "0")}Z`;
}

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Folds a content line at 75 UTF-8 octets; continuations start with one space. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = "";
  let octets = 0;

  for (const character of line) {
    const size = encoder.encode(character).length;
    if (octets + size > 75 && current.length > 0) {
      lines.push(current);
      current = ` ${character}`;
      octets = 1 + size;
    } else {
      current += character;
      octets += size;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.join("\r\n");
}

export function buildIcsCalendar({
  events,
  calendarName = "TechComp Hub",
  generatedAt = new Date(),
}: BuildIcsCalendarInput): string {
  const stamp = formatIcsUtcStamp(generatedAt);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TechComp Hub//Calendar Subscription//TH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];

  for (const event of events) {
    const start = formatIcsDate(event.startDate);
    const end = formatIcsNextDate(event.startDate);
    if (!start || !end) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(event.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
    );
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    }
    if (event.location) {
      lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    }
    if (event.url) {
      lines.push(`URL:${event.url.trim()}`);
    }
    if (event.categories && event.categories.length > 0) {
      lines.push(
        `CATEGORIES:${event.categories.map((category) => escapeIcsText(category)).join(",")}`,
      );
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
