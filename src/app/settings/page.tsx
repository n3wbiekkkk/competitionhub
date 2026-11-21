import { redirect } from "next/navigation";
import { AccountPageHeader } from "@/components/account/account-page-header";
import { CalendarSubscriptionCard } from "@/components/settings/calendar-subscription-card";
import { SettingsClient } from "@/components/settings/settings-client";
import { requireAuthUser } from "@/lib/auth/cookies";

export default async function SettingsPage() {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    redirect("/login?next=/settings");
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <AccountPageHeader
        eyebrow="บัญชีและความปลอดภัย"
        title="ตั้งค่าบัญชี"
        description="จัดการข้อมูลบัญชี รหัสผ่าน การแสดงผล และเซสชัน"
      />
      <CalendarSubscriptionCard />
      <SettingsClient profile={auth.user} />
    </main>
  );
}
