import { redirect } from "next/navigation";
import { AccountPageHeader } from "@/components/account/account-page-header";
import { AccountSubNav } from "@/components/account/account-sub-nav";
import { CalendarSubscriptionCard } from "@/components/settings/calendar-subscription-card";
import { SettingsClient } from "@/components/settings/settings-client";
import { requireAuthUser } from "@/lib/auth/cookies";

export default async function SettingsPage() {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    redirect("/login?next=/settings");
  }

  return (
    <main className="mx-auto w-full max-w-[1680px] space-y-8 px-4 py-8 sm:px-6 lg:px-8 xl:px-10">
      <AccountPageHeader
        eyebrow="บัญชีและความปลอดภัย"
        title="ตั้งค่าบัญชี"
        description="จัดการข้อมูลบัญชี รหัสผ่าน การแสดงผล และเซสชัน"
      />

      <div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] xl:gap-14">
        <AccountSubNav
          label="เมนูตั้งค่า"
          items={[
            { href: "#account", label: "ข้อมูลบัญชี" },
            { href: "#calendar-subscription", label: "ฟีดปฏิทินส่วนตัว" },
            { href: "/profile", label: "โปรไฟล์ของฉัน" },
          ]}
        />
        <div className="min-w-0 space-y-10">
          <CalendarSubscriptionCard />
          <SettingsClient profile={auth.user} />
        </div>
      </div>
    </main>
  );
}
