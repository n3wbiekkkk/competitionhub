import { z } from "zod";
import { TECH_CATEGORY_META, isTechCategory } from "@/lib/constants/tech-taxonomy";
import {
  formatThaiDate,
  getTodayIsoBangkok,
  parseIsoDateParts,
} from "@/lib/utils/thai-date";
import type {
  SchoolImpactCategoryRow,
  SchoolImpactGradeRow,
  SchoolImpactReport,
  SchoolImpactSkillRow,
  SchoolImpactTotals,
} from "@/lib/reports/types";

const academicYearSchema = z.coerce.number().int().min(2500).max(2600);

export interface AcademicYearRange {
  academicYear: number;
  labelTh: string;
  startIso: string;
  endIso: string;
  periodTh: string;
}

/** Thai school academic year runs from 1 May BE YYYY to 30 April BE YYYY+1. */
export function parseAcademicYear(raw: unknown): number | null {
  const parsed = academicYearSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function getAcademicYearRange(academicYear: number): AcademicYearRange {
  const beYear = academicYearSchema.parse(academicYear);
  const startIso = `${beYear - 543}-05-01`;
  const endIso = `${beYear - 542}-04-30`;
  const labelTh = `ปีการศึกษา ${beYear}`;
  const periodTh = `${formatThaiDate(startIso, "short")} – ${formatThaiDate(endIso, "short")}`;

  return { academicYear: beYear, labelTh, startIso, endIso, periodTh };
}

export function getCurrentAcademicYearBe(now: Date = new Date()): number {
  const today = parseIsoDateParts(getTodayIsoBangkok(now));
  if (!today) return now.getUTCFullYear() + 543;
  return today.month >= 5 ? today.year + 543 : today.year + 542;
}

export function schoolCategoryLabelTh(category: string): string {
  return isTechCategory(category)
    ? TECH_CATEGORY_META[category].labelTh
    : category;
}

export interface BuildSchoolImpactReportInput {
  academicYear: number;
  generatedAt: string;
  totals: SchoolImpactTotals;
  byCategory: SchoolImpactCategoryRow[];
  byGrade: SchoolImpactGradeRow[];
  topSkills: SchoolImpactSkillRow[];
}

export function buildSchoolImpactReport(
  input: BuildSchoolImpactReportInput,
): SchoolImpactReport {
  const range = getAcademicYearRange(input.academicYear);
  return {
    academicYear: range.academicYear,
    academicYearLabel: range.labelTh,
    periodTh: range.periodTh,
    generatedAt: input.generatedAt,
    totals: input.totals,
    byCategory: [...input.byCategory].sort((a, b) =>
      schoolCategoryLabelTh(a.category).localeCompare(
        schoolCategoryLabelTh(b.category),
        "th",
      ),
    ),
    byGrade: [...input.byGrade].sort((a, b) => a.grade.localeCompare(b.grade, "th")),
    topSkills: [...input.topSkills].sort(
      (a, b) => b.evidenceCount - a.evidenceCount || a.skill.localeCompare(b.skill),
    ),
  };
}

const FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;

/** Escapes a CSV cell and neutralizes spreadsheet formula injection. */
export function escapeCsvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = FORMULA_PREFIX_PATTERN.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvLine(cells: Array<string | number | null | undefined>): string {
  return cells.map(escapeCsvCell).join(",");
}

/** Produces an Excel-safe UTF-8 CSV with a BOM and Thai section headings. */
export function schoolImpactReportToCsv(report: SchoolImpactReport): string {
  const generatedDate = formatThaiDate(
    getTodayIsoBangkok(new Date(report.generatedAt)),
    "long",
  );
  const rows: Array<Array<string | number | null | undefined>> = [
    ["รายงานผลกระทบของโรงเรียน", report.academicYearLabel],
    ["ช่วงเวลา", report.periodTh],
    ["สร้างเมื่อ", generatedDate],
    [],
    ["ภาพรวม", "จำนวน"],
    ["นักเรียนที่เข้าร่วมกิจกรรม", report.totals.students],
    ["รายการความสนใจ", report.totals.interests],
    ["ทีมที่ได้รับการยืนยัน", report.totals.confirmedTeams],
    ["รางวัลที่รับรองแล้ว", report.totals.verifiedAwards],
    ["หลักฐานทักษะที่รับรองแล้ว", report.totals.skillEvidence],
    ["งานในทีมที่เสร็จแล้ว", report.totals.completedTasks],
    ["ตราเกียรติยศที่ได้รับ", report.totals.badgesAwarded],
    [],
    ["หมวดการแข่งขัน", "ความสนใจ", "ทีม", "รางวัล"],
    ...report.byCategory.map((row) => [
      schoolCategoryLabelTh(row.category),
      row.interests,
      row.confirmedTeams,
      row.verifiedAwards,
    ]),
    [],
    ["ระดับชั้น", "นักเรียน", "ความสนใจ", "รางวัล"],
    ...report.byGrade.map((row) => [
      row.grade,
      row.students,
      row.interests,
      row.verifiedAwards,
    ]),
    [],
    ["ทักษะที่มีหลักฐาน", "จำนวนหลักฐาน", "จำนวนนักเรียน"],
    ...report.topSkills.map((row) => [row.skill, row.evidenceCount, row.studentCount]),
  ];

  return `\uFEFF${rows.map(csvLine).join("\r\n")}\r\n`;
}
