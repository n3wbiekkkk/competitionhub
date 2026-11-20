import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { PeopleDirectory } from "@/components/profile/people-directory";
import { requireAuthUser } from "@/lib/auth/cookies";
import { listDirectoryProfiles } from "@/lib/db/directory";
import { consumeRateLimit } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    redirect("/login?next=/people");
  }

  const { q } = await searchParams;
  const limited = !consumeRateLimit(`people:${auth.user.id}`).allowed;
  const people = limited ? [] : await listDirectoryProfiles(auth.user.id, q);

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="space-y-2 border-b border-border pb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-primary">
          ค้นหาคนทำทีม
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          ผู้คน
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          เฉพาะโปรไฟล์ที่เจ้าของอนุญาตให้ค้นพบ แสดงชื่อ ห้องเรียน บทบาท และทักษะ
          เพื่อช่วยจัดทีมการแข่งขันในโรงเรียน
        </p>
      </section>

      {limited ? (
        <p
          role="alert"
          className="rounded-xl border border-peach/30 bg-peach px-4 py-3 text-sm text-peach-foreground"
        >
          ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่
        </p>
      ) : null}

      <PeopleDirectory
        people={people}
        viewerId={auth.user.id}
        initialQuery={q ?? ""}
      />

      <p className="flex items-center gap-2 border-t border-border pt-6 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" aria-hidden="true" />
        ไม่พบคนที่กำลังหา? ให้เพื่อนเปิดการค้นพบโปรไฟล์ในหน้าโปรไฟล์
      </p>
    </main>
  );
}
