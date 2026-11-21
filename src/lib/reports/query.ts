import { z } from "zod";
import { withUserDb } from "@/lib/db/pool";
import {
  buildSchoolImpactReport,
  getAcademicYearRange,
  parseAcademicYear,
} from "@/lib/reports/school-impact";
import type {
  SchoolImpactCategoryRow,
  SchoolImpactGradeRow,
  SchoolImpactSkillRow,
  SchoolImpactTotals,
} from "@/lib/reports/types";

const uuidSchema = z.string().uuid();

const totalsRowSchema = z.object({
  students: z.coerce.number().int().nonnegative(),
  interests: z.coerce.number().int().nonnegative(),
  confirmed_teams: z.coerce.number().int().nonnegative(),
  verified_awards: z.coerce.number().int().nonnegative(),
  completed_tasks: z.coerce.number().int().nonnegative(),
  badges_awarded: z.coerce.number().int().nonnegative(),
});

const categoryRowSchema = z.object({
  category: z.string().min(1),
  interests: z.coerce.number().int().nonnegative(),
  confirmed_teams: z.coerce.number().int().nonnegative(),
  verified_awards: z.coerce.number().int().nonnegative(),
});

const gradeRowSchema = z.object({
  grade: z.string().min(1),
  students: z.coerce.number().int().nonnegative(),
  interests: z.coerce.number().int().nonnegative(),
  verified_awards: z.coerce.number().int().nonnegative(),
});

const skillRowSchema = z.object({
  skill: z.string().min(1),
  evidence_count: z.coerce.number().int().nonnegative(),
  student_count: z.coerce.number().int().nonnegative(),
});

export async function loadSchoolImpactReport(input: {
  teacherId: string;
  academicYear: number;
}) {
  const teacherId = uuidSchema.parse(input.teacherId);
  const academicYear = parseAcademicYear(input.academicYear);
  if (academicYear === null) {
    throw new Error("ปีการศึกษาไม่ถูกต้อง");
  }

  const range = getAcademicYearRange(academicYear);
  const from = `${range.startIso}T00:00:00+07:00`;
  const to = `${range.endIso}T23:59:59.999999+07:00`;

  return withUserDb(teacherId, async (client) => {
    const totalsResult = await client.query(
      `with active_students as (
         select i.user_id from public.interests i
         where i.created_at between $1::timestamptz and $2::timestamptz
         union
         select tm.user_id from public.team_members tm
         join public.teams t on t.id = tm.team_id
         where t.status = 'confirmed' and t.created_at between $1::timestamptz and $2::timestamptz
         union
         select tm.user_id from public.competition_results cr
         join public.teams t on t.id = cr.team_id
         join public.team_members tm on tm.team_id = t.id
         where cr.verified_by is not null and cr.created_at between $1::timestamptz and $2::timestamptz
         union
         select tt.assignee_id from public.team_tasks tt
         where tt.assignee_id is not null and tt.status = 'done'
           and coalesce(tt.completed_at, tt.created_at) between $1::timestamptz and $2::timestamptz
       )
       select
         (select count(*)::integer from active_students) as students,
         (select count(*)::integer from public.interests i
          where i.created_at between $1::timestamptz and $2::timestamptz) as interests,
         (select count(*)::integer from public.teams t
          where t.status = 'confirmed' and t.created_at between $1::timestamptz and $2::timestamptz) as confirmed_teams,
         (select count(*)::integer from public.competition_results cr
          where cr.verified_by is not null and cr.created_at between $1::timestamptz and $2::timestamptz) as verified_awards,
         (select count(*)::integer from public.team_tasks tt
          where tt.status = 'done'
            and coalesce(tt.completed_at, tt.created_at) between $1::timestamptz and $2::timestamptz) as completed_tasks,
         (select count(*)::integer from public.user_badges ub
          where ub.awarded_at between $1::timestamptz and $2::timestamptz) as badges_awarded`,
      [from, to],
    );
    const totalsRow = totalsRowSchema.parse(totalsResult.rows[0]);

    const categoryResult = await client.query(
      `select c.category,
              count(distinct i.id)::integer as interests,
              (count(distinct t.id) filter (where t.status = 'confirmed' and t.created_at between $1::timestamptz and $2::timestamptz))::integer as confirmed_teams,
              (count(distinct cr.id) filter (where cr.verified_by is not null and cr.created_at between $1::timestamptz and $2::timestamptz))::integer as verified_awards
       from public.competitions c
       left join public.interests i
         on i.competition_id = c.id
        and i.created_at between $1::timestamptz and $2::timestamptz
       left join public.teams t on t.competition_id = c.id
       left join public.competition_results cr
         on cr.competition_id = c.id
        and cr.verified_by is not null
        and cr.created_at between $1::timestamptz and $2::timestamptz
       group by c.category
       order by c.category`,
      [from, to],
    );
    const byCategory: SchoolImpactCategoryRow[] = categoryRowSchema
      .array()
      .parse(categoryResult.rows)
      .map((row) => ({
        category: row.category,
        interests: row.interests,
        confirmedTeams: row.confirmed_teams,
        verifiedAwards: row.verified_awards,
      }));

    const gradeResult = await client.query(
      `with events as (
         select i.user_id, p.grade, 'interest' as kind
         from public.interests i
         join public.profiles p on p.id = i.user_id
         where i.created_at between $1::timestamptz and $2::timestamptz

         union all

         select tm.user_id, p.grade, 'team' as kind
         from public.teams t
         join public.team_members tm on tm.team_id = t.id
         join public.profiles p on p.id = tm.user_id
         where t.status = 'confirmed' and t.created_at between $1::timestamptz and $2::timestamptz

         union all

         select tm.user_id, p.grade, 'award' as kind
         from public.competition_results cr
         join public.teams t on t.id = cr.team_id
         join public.team_members tm on tm.team_id = t.id
         join public.profiles p on p.id = tm.user_id
         where cr.verified_by is not null and cr.created_at between $1::timestamptz and $2::timestamptz
       )
       select coalesce(nullif(btrim(grade), ''), 'ไม่ระบุระดับชั้น') as grade,
              count(distinct user_id)::integer as students,
              (count(*) filter (where kind = 'interest'))::integer as interests,
              (count(*) filter (where kind = 'award'))::integer as verified_awards
       from events
       group by 1
       order by 1`,
      [from, to],
    );
    const byGrade: SchoolImpactGradeRow[] = gradeRowSchema
      .array()
      .parse(gradeResult.rows)
      .map((row) => ({
        grade: row.grade,
        students: row.students,
        interests: row.interests,
        verifiedAwards: row.verified_awards,
      }));

    const skillResult = await client.query(
      `with verified_results as (
         select distinct cr.id as result_id, cr.competition_id, cr.team_id, c.tech_stack_hints
         from public.competition_results cr
         join public.competitions c on c.id = cr.competition_id and c.status = 'closed'
         join public.teams t on t.id = cr.team_id and t.status = 'confirmed'
         where cr.verified_by is not null
           and cr.created_at between $1::timestamptz and $2::timestamptz
       ),
       evidence_items as (
         select tm.user_id, vr.competition_id, lower(btrim(tm.assigned_role)) as skill
         from verified_results vr
         join public.team_members tm on tm.team_id = vr.team_id

         union all

         select tm.user_id, vr.competition_id, lower(btrim(hint)) as skill
         from verified_results vr
         join public.team_members tm on tm.team_id = vr.team_id
         cross join lateral unnest(vr.tech_stack_hints) as hint
       )
       select skill,
              count(distinct competition_id)::integer as evidence_count,
              count(distinct user_id)::integer as student_count
       from evidence_items
       where btrim(skill) <> ''
       group by skill
       order by evidence_count desc, skill asc`,
      [from, to],
    );
    const allSkills: SchoolImpactSkillRow[] = skillRowSchema
      .array()
      .parse(skillResult.rows)
      .map((row) => ({
        skill: row.skill,
        evidenceCount: row.evidence_count,
        studentCount: row.student_count,
      }));

    const totals: SchoolImpactTotals = {
      students: totalsRow.students,
      interests: totalsRow.interests,
      confirmedTeams: totalsRow.confirmed_teams,
      verifiedAwards: totalsRow.verified_awards,
      skillEvidence: allSkills.reduce((sum, row) => sum + row.evidenceCount, 0),
      completedTasks: totalsRow.completed_tasks,
      badgesAwarded: totalsRow.badges_awarded,
    };

    return buildSchoolImpactReport({
      academicYear,
      generatedAt: new Date().toISOString(),
      totals,
      byCategory,
      byGrade,
      topSkills: allSkills.slice(0, 12),
    });
  });
}
