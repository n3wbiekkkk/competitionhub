import Link from "next/link";
import { Settings2 } from "lucide-react";
import { AccountPageHeader } from "@/components/account/account-page-header";
import { ProfileForm } from "@/components/profile/profile-form";
import { requireAuthUser } from "@/lib/auth/cookies";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    redirect("/login?next=/profile");
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <AccountPageHeader
        eyebrow="โปรไฟล์สำหรับจัดทีม"
        title="โปรไฟล์ของฉัน"
        description="ข้อมูลที่อาจารย์และเพื่อนใช้จับคู่ทีมแข่งขันในโรงเรียน"
        action={
          <ButtonLink href="/settings#account">
            <Settings2 className="h-4 w-4" />
            ตั้งค่าบัญชี
          </ButtonLink>
        }
      />
      <ProfileForm initialProfile={auth.user} />
    </main>
  );
}

function ButtonLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
    >
      {children}
    </Link>
  );
}
