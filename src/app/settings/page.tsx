import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/settings/settings-client";
import { getAuthenticatedProfile } from "@/lib/auth/cookies";
import { USER_ROLE_LABELS_TH } from "@/lib/constants/tech-taxonomy";

export default async function SettingsPage() {
  const profile = await getAuthenticatedProfile();
  if (!profile) {
    redirect("/login?next=/settings");
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="space-y-1.5 border-b border-border pb-6">
        <p className="text-xs font-medium tracking-wide text-muted-foreground">
          {USER_ROLE_LABELS_TH[profile.role]}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          ตั้งค่าบัญชีและระบบ
        </h1>
        <p className="text-sm text-muted-foreground">
          แก้ไขชื่อ ห้องเรียน เปลี่ยนรหัสผ่าน และปรับธีมการแสดงผล
        </p>
      </section>

      <SettingsClient profile={profile} />
    </main>
  );
}
