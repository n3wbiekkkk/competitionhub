import test from "node:test";
import assert from "node:assert/strict";
import {
  buildIcsCalendar,
  escapeIcsText,
  foldIcsLine,
  formatIcsDate,
  formatIcsNextDate,
  formatIcsUtcStamp,
} from "../src/lib/integrations/calendar.ts";
import {
  buildHttpsFeedUrl,
  buildWebcalUrl,
  generateCalendarToken,
  hashCalendarToken,
  parseCalendarToken,
} from "../src/lib/integrations/calendar-token.ts";

test("all-day dates use CE calendar values and an exclusive next-day DTEND", () => {
  assert.equal(formatIcsDate("2026-12-31"), "20261231");
  assert.equal(formatIcsNextDate("2026-12-31"), "20270101");
  assert.equal(formatIcsNextDate("2028-02-28"), "20280229");
  assert.equal(formatIcsDate("2026-02-30"), null);
  assert.equal(formatIcsNextDate("not-a-date"), null);
});

test("UTC DTSTAMP is stable and independent of local time", () => {
  assert.equal(
    formatIcsUtcStamp(new Date("2026-03-04T05:06:07.000Z")),
    "20260304T050607Z",
  );
});

test("text values escape RFC 5545 delimiters", () => {
  assert.equal(
    escapeIcsText("A;B,C\\D\r\nE"),
    "A\\;B\\,C\\\\D\\nE",
  );
});

test("folded lines stay within 75 octets and reassemble exactly", () => {
  const original = `SUMMARY:${"ทีมหุ่นยนต์และการแข่งขันเทคโนโลยี".repeat(12)}`;
  const folded = foldIcsLine(original);
  const lines = folded.split("\r\n");
  assert.ok(lines.length > 1);
  for (const line of lines) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75);
  }
  for (const line of lines.slice(1)) {
    assert.ok(line.startsWith(" "));
  }
  assert.equal(
    lines.map((line, index) => (index === 0 ? line : line.slice(1))).join(""),
    original,
  );
});

test("calendar feed emits valid VEVENTs and skips malformed deadlines", () => {
  const ics = buildIcsCalendar({
    calendarName: "TechComp, Hub",
    generatedAt: new Date("2026-03-04T05:06:07.000Z"),
    events: [
      {
        uid: "bookmark-1@techcomp-hub",
        title: "ปิดรับสมัคร: Contest A",
        startDate: "2026-04-01",
        description: "รายการ;สำคัญ,ใหม่",
        url: "https://example.com/competitions/1",
        categories: ["competition"],
      },
      {
        uid: "invalid@techcomp-hub",
        title: "ข้ามรายการนี้",
        startDate: "2026-13-40",
      },
    ],
  });

  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.includes("X-WR-CALNAME:TechComp\\, Hub"));
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20260401"));
  assert.ok(ics.includes("DTEND;VALUE=DATE:20260402"));
  assert.ok(ics.includes("DTSTAMP:20260304T050607Z"));
  assert.ok(ics.includes("DESCRIPTION:รายการ\\;สำคัญ\\,ใหม่"));
  assert.ok(!ics.includes("ข้ามรายการนี้"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  for (const line of ics.split("\r\n").slice(0, -1)) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75);
  }
});

test("feed tokens are opaque, hashed, and shape-checked", () => {
  const token = generateCalendarToken();
  assert.equal(parseCalendarToken(token), token);
  assert.equal(parseCalendarToken("short"), null);
  assert.equal(parseCalendarToken("a".repeat(200)), null);

  const digest = hashCalendarToken(token);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest, hashCalendarToken(token));
  assert.notEqual(digest, token);
});

test("feed URLs carry the opaque token and use the request origin", () => {
  const https = buildHttpsFeedUrl("http://localhost:3000/settings", "abc");
  assert.equal(
    https,
    "http://localhost:3000/api/calendar/feed/abc.ics",
  );
  assert.equal(
    buildWebcalUrl("https://hub.example.com/settings", "abc"),
    "webcal://hub.example.com/api/calendar/feed/abc.ics",
  );
});
