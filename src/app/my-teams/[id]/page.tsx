import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { StudentTeamsControls } from "@/components/teacher/student-teams-controls";
import { RecruitmentLfgPanel } from "@/components/teams/recruitment-lfg-panel";
import { Button } from "@/components/ui/button";
import { getAuthenticatedProfile } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();

interface CompetitionTitleRow {
  id: string;
  title: string;
  status: string;
}

export default async function CompetitionTeamWorkspace({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    notFound();
  }

  const user = await getAuthenticatedProfile();
  if (!user) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
        <p className="text-sm text-muted-foreground">
          กรุณาเข้าสู่ระบบก่อนจัดทีม
        </p>
        <Button asChild size="sm" className="mt-4 rounded-md">
          <Link href={`/login?next=/my-teams/${id}`}>เข้าสู่ระบบ</Link>
        </Button>
      </main>
    );
  }

  let competition: CompetitionTitleRow | null = null;
  try {
    const result = await withUserDb(user.id, (client) =>
      client.query<CompetitionTitleRow>(
        "SELECT id, title, status::text FROM public.competitions WHERE id = $1 LIMIT 1",
        [id],
      ),
    );
    competition = result.rows[0] ?? null;
  } catch (error) {
    logError("[my-teams/[id]] load failed", error);
  }

  if (!competition) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-5">
        <div className="space-y-1.5">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Link href="/my-teams">
              <ArrowLeft className="h-4 w-4" />
              กลับไปหน้าทีมของฉัน
            </Link>
          </Button>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            จัดทีม: {competition.title}
          </h1>
          <p className="text-xs text-muted-foreground">
            ตั้งทีม เชิญเพื่อน และขอเข้าร่วมตำแหน่งที่เปิดรับในรายการนี้
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="rounded-md">
          <Link href={`/competitions/${competition.id}`}>
            ดูรายละเอียดการแข่งขัน
          </Link>
        </Button>
      </div>

      {user.role === "teacher" ? (
        <>
          <StudentTeamsControls competitionId={competition.id} />
          <RecruitmentLfgPanel competitionId={competition.id} />
        </>
      ) : (
        <RecruitmentLfgPanel competitionId={competition.id} />
      )}
    </main>
  );
}
