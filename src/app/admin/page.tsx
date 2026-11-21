import { redirect } from "next/navigation";
import { AdminDashboardClient } from "@/components/admin/admin-dashboard-client";
import { getAuthenticatedProfile } from "@/lib/auth/cookies";
import { withSystemDb, withUserDb } from "@/lib/db/pool";
import { AdminOpsPanel } from "@/components/admin/admin-ops-panel";
import { LazyOpsTelemetry } from "@/components/admin/ops-telemetry-lazy";
import { WebhookRoutingManager } from "@/components/admin/webhook-routing-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WebhookRouteItem } from "@/lib/integrations/webhook-events";
import { loadOpsTelemetry } from "@/lib/ops/telemetry";
import type {
  AdminCompetitionItem,
  AdminTeamItem,
  AdminTeamMemberSummary,
  AdminUserItem,
  AuditLogItem,
  Competition,
  OutboxItem,
  Profile,
} from "@/types/database";

export const dynamic = "force-dynamic";

interface AdminUserRow extends Profile {
  interest_count: string;
  confirmed_team_count: string;
}

interface AdminCompetitionRow extends Competition {
  interest_count: string;
  team_count: string;
  confirmed_team_count: string;
}

interface AdminTeamRow {
  id: string;
  competition_id: string;
  competition_title: string;
  name: string;
  status: "draft" | "confirmed";
  advisor_name: string | null;
  created_at: string;
}

interface AdminTeamMemberRow extends AdminTeamMemberSummary {
  team_id: string;
}

export default async function AdminDashboardPage() {
  const user = await getAuthenticatedProfile();
  if (!user) {
    redirect("/login?next=/admin");
  }
  if (user.role !== "teacher") {
    redirect("/");
  }

  const { users, competitions, teams } = await withUserDb(
    user.id,
    async (client) => {
      const [usersRes, compsRes, teamsRes, membersRes] = await Promise.all([
        client.query<AdminUserRow>(
          `SELECT p.id, p.full_name, p.nickname, p.email, p.role, p.grade, p.skills,
                  p.contact, p.github_url, p.portfolio_url, p.bio, p.avatar_url, p.discord_url, p.line_url, p.directory_visible,
                  p.created_at::text, p.updated_at::text,
                  COALESCE((
                    SELECT count(*)::text FROM public.interests i WHERE i.user_id = p.id
                  ), '0') AS interest_count,
                  COALESCE((
                    SELECT count(*)::text
                    FROM public.team_members tm
                    JOIN public.teams t ON t.id = tm.team_id
                    WHERE tm.user_id = p.id AND t.status = 'confirmed'
                  ), '0') AS confirmed_team_count
           FROM public.profiles p
           ORDER BY p.created_at DESC`,
        ),
        client.query<AdminCompetitionRow>(
          `SELECT c.id, c.title, c.category, c.deadline::text, c.min_size, c.max_size,
                  c.recommended_roles, c.tech_stack_hints, c.eligibility, c.summary,
                  c.source_url, c.source_type, c.status, c.created_by,
                  c.created_at::text, c.updated_at::text,
                  COALESCE(cnt.interest_count, 0)::text AS interest_count,
                  COALESCE((
                    SELECT count(*)::text FROM public.teams t WHERE t.competition_id = c.id
                  ), '0') AS team_count,
                  COALESCE((
                    SELECT count(*)::text FROM public.teams t WHERE t.competition_id = c.id AND t.status = 'confirmed'
                  ), '0') AS confirmed_team_count
           FROM public.competitions c
           LEFT JOIN public.get_competition_interest_counts(NULL) cnt
             ON cnt.competition_id = c.id
           ORDER BY
             CASE c.status
               WHEN 'pending_review' THEN 1
               WHEN 'open' THEN 2
               WHEN 'closed' THEN 3
               ELSE 4
             END,
             c.deadline ASC NULLS LAST,
             c.created_at DESC`,
        ),
        client.query<AdminTeamRow>(
          `SELECT t.id, t.competition_id, c.title AS competition_title,
                  t.name, t.status, adv.full_name AS advisor_name,
                  t.created_at::text
           FROM public.teams t
           JOIN public.competitions c ON c.id = t.competition_id
           LEFT JOIN public.profiles adv ON adv.id = t.advisor_id
           ORDER BY t.status DESC, t.created_at DESC`,
        ),
        client.query<AdminTeamMemberRow>(
          `SELECT tm.team_id, tm.user_id, p.full_name, p.nickname, p.grade, tm.assigned_role
           FROM public.team_members tm
           JOIN public.profiles p ON p.id = tm.user_id
           ORDER BY p.full_name ASC`,
        ),
      ]);

      const membersMap = new Map<string, AdminTeamMemberSummary[]>();
      for (const row of membersRes.rows) {
        const list = membersMap.get(row.team_id) ?? [];
        list.push({
          user_id: row.user_id,
          full_name: row.full_name,
          nickname: row.nickname,
          grade: row.grade,
          assigned_role: row.assigned_role,
        });
        membersMap.set(row.team_id, list);
      }

      const mappedUsers: AdminUserItem[] = usersRes.rows.map((row) => ({
        ...row,
        interest_count: Number(row.interest_count),
        confirmed_team_count: Number(row.confirmed_team_count),
      }));

      const mappedCompetitions: AdminCompetitionItem[] = compsRes.rows.map(
        (row) => ({
          ...row,
          interest_count: Number(row.interest_count),
          team_count: Number(row.team_count),
          confirmed_team_count: Number(row.confirmed_team_count),
        }),
      );

      const mappedTeams: AdminTeamItem[] = teamsRes.rows.map((row) => ({
        ...row,
        members: membersMap.get(row.id) ?? [],
      }));

      return {
        users: mappedUsers,
        competitions: mappedCompetitions,
        teams: mappedTeams,
      };
    },
  );

  const ops = await withSystemDb(async (client) => {
    const [outboxRes, auditRes] = await Promise.all([
      client.query<OutboxItem>(
        `select id, to_email, template, status, attempts, last_error, created_at::text
         from public.email_outbox order by created_at desc limit 20`,
      ),
      client.query<AuditLogItem>(
        `select id, actor_id, action, target_type, target_id, created_at::text
         from public.audit_logs order by created_at desc limit 30`,
      ),
    ]);
    return { outbox: outboxRes.rows, auditLogs: auditRes.rows };
  });

  const telemetry = await loadOpsTelemetry();
  const webhookRoutes = await withSystemDb(async (client) => {
    const res = await client.query<WebhookRouteItem>(
      `select id, name, target_url, events,
              is_active, created_at::text, updated_at::text,
              last_success_at::text, last_failure_at::text
       from public.webhook_routes
       order by created_at desc`,
    );
    return res.rows;
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Tabs defaultValue="dashboard" className="gap-6">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList
            variant="line"
            className="h-auto w-max min-w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0 group-data-horizontal/tabs:h-auto"
          >
            <TabsTrigger
              value="dashboard"
              className="flex-none rounded-none px-0 pb-2.5 text-sm font-normal after:bg-primary group-data-horizontal/tabs:after:bottom-0 data-active:font-medium"
            >
              ภาพรวมระบบ
            </TabsTrigger>
            <TabsTrigger
              value="ops"
              className="flex-none rounded-none px-0 pb-2.5 text-sm font-normal after:bg-primary group-data-horizontal/tabs:after:bottom-0 data-active:font-medium"
            >
              การดำเนินงาน
            </TabsTrigger>
            <TabsTrigger
              value="webhooks"
              className="flex-none rounded-none px-0 pb-2.5 text-sm font-normal after:bg-primary group-data-horizontal/tabs:after:bottom-0 data-active:font-medium"
            >
              เว็บฮุก
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="dashboard" className="mt-0">
          <AdminDashboardClient
            currentUserId={user.id}
            initialUsers={users}
            initialCompetitions={competitions}
            initialTeams={teams}
          />
        </TabsContent>

        <TabsContent value="ops" className="mt-0 grid gap-6 xl:grid-cols-2">
          <AdminOpsPanel outbox={ops.outbox} auditLogs={ops.auditLogs} />
          <LazyOpsTelemetry snapshot={telemetry} />
        </TabsContent>

        <TabsContent value="webhooks" className="mt-0">
          <WebhookRoutingManager initialRoutes={webhookRoutes} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
