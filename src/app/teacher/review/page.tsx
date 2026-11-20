import { redirect } from "next/navigation";
import { ResetRequestsPanel } from "@/components/teacher/reset-requests-panel";
import { ReviewQueueClient,
  type ReviewCompetitionItem,
} from "@/components/teacher/review-queue-client";
import { getAuthenticatedProfile } from "@/lib/auth/cookies";
import type { UserRole } from "@/lib/constants/tech-taxonomy";
import { withSystemDb, withUserDb } from "@/lib/db/pool";
import type { PasswordResetRequest } from "@/types/database";
import type { Competition } from "@/types/database";

interface ReviewRow extends Competition {
  interest_count: string;
  submitter_name: string | null;
  submitter_role: UserRole | null;
}

export default async function TeacherReviewPage() {
  const user = await getAuthenticatedProfile();
  if (!user) {
    redirect("/login?next=/teacher/review");
  }
  if (user.role !== "teacher") {
    redirect("/");
  }

  const items: ReviewCompetitionItem[] = await withUserDb(
    user.id,
    async (client) => {
      const res = await client.query<ReviewRow>(
        `SELECT c.id, c.title, c.category, c.deadline::text, c.min_size, c.max_size,
                c.recommended_roles, c.tech_stack_hints, c.eligibility, c.summary,
                c.source_url, c.source_type, c.status, c.created_by,
                c.created_at::text, c.updated_at::text,
                COALESCE(cnt.interest_count, 0)::text AS interest_count,
                p.full_name AS submitter_name,
                p.role AS submitter_role
         FROM public.competitions c
         LEFT JOIN public.profiles p ON p.id = c.created_by
         LEFT JOIN public.get_competition_interest_counts(NULL) cnt
           ON cnt.competition_id = c.id
         ORDER BY
           CASE c.status
             WHEN 'pending_review' THEN 1
             WHEN 'open' THEN 2
             WHEN 'closed' THEN 3
             ELSE 4
           END,
           c.created_at DESC`,
      );

      return res.rows.map((row) => ({
        ...row,
        interest_count: Number(row.interest_count),
      }));
    },
  );

  const resetRequests: PasswordResetRequest[] = await withSystemDb(
    async (client) => {
      await client.query("SELECT public.expire_password_reset_requests()");
      const result = await client.query<PasswordResetRequest>(
        `SELECT r.id, r.user_id, r.status,
                r.requested_at::text, r.expires_at::text,
                r.resolved_at::text, r.resolved_by,
                p.full_name, a.email
         FROM public.password_reset_requests r
         JOIN public.profiles p ON p.id = r.user_id
         JOIN public.auth_accounts a ON a.id = r.user_id
         WHERE r.status = 'pending' AND r.expires_at > now()
         ORDER BY r.requested_at DESC
         LIMIT 20`,
      );
      return result.rows;
    },
  );

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
      <ResetRequestsPanel requests={resetRequests} />
      <ReviewQueueClient initialCompetitions={items} />
    </main>
  );
}
