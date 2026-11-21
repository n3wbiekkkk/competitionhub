import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeCsvCell,
  getAcademicYearRange,
  getCurrentAcademicYearBe,
  parseAcademicYear,
  schoolCategoryLabelTh,
  schoolImpactReportToCsv,
} from "../src/lib/reports/school-impact.ts";
import type { SchoolImpactReport } from "../src/lib/reports/types.ts";

test("academic year accepts Thai BE and rejects CE or malformed values", () => {
  assert.equal(parseAcademicYear("2569"), 2569);
  assert.equal(parseAcademicYear(2569), 2569);
  assert.equal(parseAcademicYear("2026"), null);
  assert.equal(parseAcademicYear("abc"), null);
  assert.equal(parseAcademicYear("9999"), null);
});

test("Thai academic year spans 1 May BE to 30 April BE+1", () => {
  const range = getAcademicYearRange(2569);
  assert.equal(range.startIso, "2026-05-01");
  assert.equal(range.endIso, "2027-04-30");
  assert.equal(range.labelTh, "ปีการศึกษา 2569");
  assert.equal(range.periodTh, "1 พ.ค. 2569 – 30 เม.ย. 2570");
});

test("current academic year changes at Thai month 5", () => {
  assert.equal(
    getCurrentAcademicYearBe(new Date("2026-04-30T10:00:00.000Z")),
    2568,
  );
  assert.equal(
    getCurrentAcademicYearBe(new Date("2026-05-01T00:00:00.000Z")),
    2569,
  );
});

test("category labels stay in Thai for known taxonomy values", () => {
  assert.equal(
    schoolCategoryLabelTh("AI & Data Science"),
    "ปัญญาประดิษฐ์ / ML / Data",
  );
  assert.equal(schoolCategoryLabelTh("Custom / Local"), "Custom / Local");
});

test("CSV starts with BOM and neutralizes formula injection", () => {
  assert.equal(escapeCsvCell("=SUM(A1:A2)"), "\"'=SUM(A1:A2)\"");
  assert.equal(escapeCsvCell("@cmd"), "\"'@cmd\"");
  assert.equal(escapeCsvCell("Math \"A\""), "\"Math \"\"A\"\"\"");
  assert.equal(escapeCsvCell(12), "\"12\"");

  const report: SchoolImpactReport = {
    academicYear: 2569,
    academicYearLabel: "ปีการศึกษา 2569",
    periodTh: "1 พ.ค. 2569 – 30 เม.ย. 2570",
    generatedAt: "2026-06-01T00:00:00.000Z",
    totals: {
      students: 2,
      interests: 3,
      confirmedTeams: 1,
      verifiedAwards: 1,
      skillEvidence: 2,
      completedTasks: 5,
      badgesAwarded: 4,
    },
    byCategory: [],
    byGrade: [],
    topSkills: [],
  };
  const csv = schoolImpactReportToCsv(report);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("\"รายงานผลกระทบของโรงเรียน\",\"ปีการศึกษา 2569\""));
  assert.ok(csv.includes("\"นักเรียนที่เข้าร่วมกิจกรรม\",\"2\""));
  assert.ok(csv.includes("\r\n"));
});
