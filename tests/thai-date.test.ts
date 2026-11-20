import test from "node:test";
import assert from "node:assert/strict";
import {
  formatThaiDate,
  getDeadlineCountdown,
  getTodayIsoBangkok,
  normalizeToIsoCeDate,
} from "../src/lib/utils/thai-date.ts";

test("Buddhist Era years are normalized to Christian Era", () => {
  assert.equal(normalizeToIsoCeDate("2569-11-25"), "2026-11-25");
  assert.equal(normalizeToIsoCeDate("2026-11-25"), "2026-11-25");
});

test("impossible dates are rejected instead of rolling over", () => {
  assert.equal(normalizeToIsoCeDate("2026-02-30"), null);
  assert.equal(normalizeToIsoCeDate("not-a-date"), null);
});

test("Thai display adds 543 and uses the requested month style", () => {
  assert.equal(formatThaiDate("2026-11-25", "short"), "25 พ.ย. 2569");
  assert.equal(formatThaiDate("2026-11-25", "long"), "25 พฤศจิกายน 2569");
  assert.equal(formatThaiDate(null), "ไม่ระบุวันปิดรับสมัคร");
});

test("countdown is calendar-day arithmetic at UTC midnight", () => {
  assert.equal(
    getDeadlineCountdown("2026-11-25", "2026-11-20").kind,
    "urgent",
  );
  assert.equal(
    getDeadlineCountdown("2026-11-25", "2026-11-20").daysRemaining,
    5,
  );
  assert.equal(getDeadlineCountdown("2026-11-20", "2026-11-20").kind, "today");
  assert.equal(
    getDeadlineCountdown("2026-11-19", "2026-11-20").kind,
    "expired",
  );
});

test("Bangkok today never drifts for a late UTC timestamp", () => {
  // 2026-11-19T18:30Z is already 2026-11-20 in Bangkok (UTC+7).
  assert.equal(
    getTodayIsoBangkok(new Date("2026-11-19T18:30:00Z")),
    "2026-11-20",
  );
});
