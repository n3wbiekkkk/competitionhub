import {
  CompetitionFeed,
  type FeedCompetitionItem,
  type InitialFeedFilters,
  type SortOption,
  type TargetLevelFilter,
  type TeamSizeFilter,
} from "@/components/competitions/competition-feed";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getAuthenticatedProfile } from "@/lib/auth/cookies";
import { isTechCategory } from "@/lib/constants/tech-taxonomy";
import { withUserDb } from "@/lib/db/pool";
import { getTodayIsoBangkok } from "@/lib/utils/thai-date";
import type { Competition } from "@/types/database";

export const dynamic = "force-dynamic";

interface FeedRow extends Competition {
  interest_count: string;
  my_preferred_role: string | null;
}

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseTargetLevel(value: string | undefined): TargetLevelFilter {
  if (
    value === "all" ||
    value === "high_school" ||
    value === "university" ||
    value === "public"
  ) {
    return value;
  }
  return "all";
}

function parseTeamSize(value: string | undefined): TeamSizeFilter {
  if (
    value === "all" ||
    value === "solo" ||
    value === "small" ||
    value === "large"
  ) {
    return value;
  }
  return "all";
}

function parseSort(value: string | undefined): SortOption {
  if (
    value === "deadline_asc" ||
    value === "popular" ||
    value === "newest" ||
    value === "match"
  ) {
    return value;
  }
  return "deadline_asc";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, rawParams] = await Promise.all([
    getAuthenticatedProfile(),
    searchParams,
  ]);
  const todayIso = getTodayIsoBangkok();

  const rawCategory = firstParam(rawParams.category);
  const rawQuery = (firstParam(rawParams.q) ?? "").trim().slice(0, 100);

  const initialFilters: InitialFeedFilters = {
    status: firstParam(rawParams.status) === "closed" ? "closed" : "open",
    category: isTechCategory(rawCategory) ? rawCategory : "all",
    level: parseTargetLevel(firstParam(rawParams.level)),
    size: parseTeamSize(firstParam(rawParams.size)),
    sort: parseSort(firstParam(rawParams.sort)),
    q: rawQuery,
    match: firstParam(rawParams.match) === "1",
  };

  let competitions: FeedCompetitionItem[] = [];
  let dbError = false;

  try {
    competitions = await withUserDb(user?.id ?? null, async (client) => {
      const res = await client.query<FeedRow>(
        `SELECT c.id, c.title, c.category, c.deadline::text, c.min_size, c.max_size,
                c.recommended_roles, c.tech_stack_hints, c.eligibility, c.summary,
                c.source_url, c.source_type, c.status, c.created_by,
                c.created_at::text, c.updated_at::text,
                COALESCE(cnt.interest_count, 0)::text AS interest_count,
                my_i.preferred_role AS my_preferred_role
         FROM public.competitions c
         LEFT JOIN public.get_competition_interest_counts(NULL) cnt
           ON cnt.competition_id = c.id
         LEFT JOIN public.interests my_i
           ON my_i.competition_id = c.id
          AND my_i.user_id = public.app_uid()
         WHERE c.status IN ('open', 'closed')
         ORDER BY c.deadline ASC NULLS LAST, c.created_at DESC`,
      );

      return res.rows.map((row) => ({
        ...row,
        interest_count: Number(row.interest_count),
      }));
    });
  } catch {
    dbError = true;
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {dbError ? (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>ยังไม่สามารถเชื่อมต่อฐานข้อมูล PostgreSQL ได้</AlertTitle>
          <AlertDescription>
            กรุณาตรวจสอบว่าฐานข้อมูลกำลังทำงานอยู่ (รัน{" "}
            <code className="font-mono">docker compose up -d</code>)
          </AlertDescription>
        </Alert>
      ) : null}

      <CompetitionFeed
        competitions={competitions}
        userRole={user?.role ?? null}
        userSkills={user?.skills ?? []}
        initialFilters={initialFilters}
        todayIso={todayIso}
      />
    </main>
  );
}
