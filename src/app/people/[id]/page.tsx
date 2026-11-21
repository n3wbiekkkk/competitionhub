import { redirect } from "next/navigation";
import { z } from "zod";
import { ProfileView } from "@/components/profile/profile-view";
import { requireAuthUser } from "@/lib/auth/cookies";
import { getDirectoryProfile } from "@/lib/db/directory";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();

export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    notFound();
  }

  const auth = await requireAuthUser();
  if (!auth.ok) {
    redirect(`/login?next=/people/${id}`);
  }

  if (!(await consumeRateLimit(`person:${auth.user.id}`)).allowed) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p role="alert" className="rounded-xl border border-peach/30 bg-peach px-4 py-3 text-sm text-peach-foreground">
         เปิดโปรไฟล์บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่
        </p>
      </main>
    );
  }

  if (id === auth.user.id) {
    redirect("/profile");
  }

  const profile = await getDirectoryProfile(auth.user.id, id);
  if (!profile) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <ProfileView profile={profile} />
    </main>
  );
}
