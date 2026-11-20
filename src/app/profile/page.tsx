import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/profile/profile-form";
import { getAuthenticatedProfile } from "@/lib/auth/cookies";
import { USER_ROLE_LABELS_TH } from "@/lib/constants/tech-taxonomy";

export default async function ProfilePage() {
  const profile = await getAuthenticatedProfile();
  if (!profile) {
    redirect("/login?next=/profile");
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="space-y-1.5 border-b border-border pb-6">
        <p className="text-xs font-medium tracking-wide text-muted-foreground">
          {USER_ROLE_LABELS_TH[profile.role]}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          โปรไฟล์สาย Tech ของฉัน
        </h1>
        <p className="text-sm text-muted-foreground">
          จัดการทักษะด้านคอมพิวเตอร์ ลิงก์ GitHub / Portfolio และช่องทางติดต่อ
        </p>
      </section>

      <ProfileForm initialProfile={profile} />
    </main>
  );
}
