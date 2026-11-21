import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { TeamBuilderBoard } from "@/components/teacher/team-builder-board";
import { getAuthenticatedProfile } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";
import { loadTeamBuilderData } from "@/lib/db/team-builder";

const uuidSchema = z.string().uuid();

export default async function TeacherTeamBuilderPage({
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
    redirect(`/login?next=/teacher/competitions/${id}/teams`);
  }
  if (user.role !== "teacher") {
    redirect("/");
  }

  const data = await withUserDb(user.id, (client) =>
    loadTeamBuilderData(client, id),
  );

  if (!data) {
    notFound();
  }

  return (
    <main className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
      <TeamBuilderBoard
        competition={data.competition}
        interestedStudents={data.interestedStudents}
        initialTeams={data.teams}
        teachers={data.teachers}
        currentTeacherId={user.id}
      />
    </main>
  );
}
