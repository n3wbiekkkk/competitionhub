import { z } from "zod";

export const schoolImpactQuerySchema = z.object({
  academicYear: z.coerce.number().int().min(2500).max(2600),
});

export type SchoolImpactQuery = z.infer<typeof schoolImpactQuerySchema>;

export interface SchoolImpactTotals {
  students: number;
  interests: number;
  confirmedTeams: number;
  verifiedAwards: number;
  skillEvidence: number;
  completedTasks: number;
  badgesAwarded: number;
}

export interface SchoolImpactCategoryRow {
  category: string;
  interests: number;
  confirmedTeams: number;
  verifiedAwards: number;
}

export interface SchoolImpactGradeRow {
  grade: string;
  students: number;
  interests: number;
  verifiedAwards: number;
}

export interface SchoolImpactSkillRow {
  skill: string;
  evidenceCount: number;
  studentCount: number;
}

export interface SchoolImpactReport {
  academicYear: number;
  academicYearLabel: string;
  periodTh: string;
  generatedAt: string;
  totals: SchoolImpactTotals;
  byCategory: SchoolImpactCategoryRow[];
  byGrade: SchoolImpactGradeRow[];
  topSkills: SchoolImpactSkillRow[];
}

const nonnegativeInt = z.number().int().nonnegative();

const schoolImpactTotalsSchema = z.object({
  students: nonnegativeInt,
  interests: nonnegativeInt,
  confirmedTeams: nonnegativeInt,
  verifiedAwards: nonnegativeInt,
  skillEvidence: nonnegativeInt,
  completedTasks: nonnegativeInt,
  badgesAwarded: nonnegativeInt,
});

const schoolImpactCategoryRowSchema = z.object({
  category: z.string().min(1),
  interests: nonnegativeInt,
  confirmedTeams: nonnegativeInt,
  verifiedAwards: nonnegativeInt,
});

const schoolImpactGradeRowSchema = z.object({
  grade: z.string().min(1),
  students: nonnegativeInt,
  interests: nonnegativeInt,
  verifiedAwards: nonnegativeInt,
});

const schoolImpactSkillRowSchema = z.object({
  skill: z.string().min(1),
  evidenceCount: nonnegativeInt,
  studentCount: nonnegativeInt,
});

export const schoolImpactReportSchema = z.object({
  academicYear: z.number().int().min(2500).max(2600),
  academicYearLabel: z.string().min(1),
  periodTh: z.string().min(1),
  generatedAt: z.string().min(1),
  totals: schoolImpactTotalsSchema,
  byCategory: z.array(schoolImpactCategoryRowSchema),
  byGrade: z.array(schoolImpactGradeRowSchema),
  topSkills: z.array(schoolImpactSkillRowSchema),
});

export const schoolImpactResponseSchema = z.object({
  report: schoolImpactReportSchema,
});
