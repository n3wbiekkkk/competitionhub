import Link from "next/link";
import { Settings2 } from "lucide-react";
import { AccountPageHeader } from "@/components/account/account-page-header";
import { AccountSubNav } from "@/components/account/account-sub-nav";
import { ProfileBadges } from "@/components/badges/profile-badges";
import { VerifiedSkillEvidencePanel } from "@/components/badges/verified-skill-evidence";
import { ProfileForm } from "@/components/profile/profile-form";
import { requireAuthUser } from "@/lib/auth/cookies";
import { getVerifiedSkillEvidence, listMyBadges } from "@/lib/db/badges";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    redirect("/login?next=/profile");
  }

  const [badges, skillEvidence] = await Promise.all([
    listMyBadges(auth.user.id),
    getVerifiedSkillEvidence({ viewerId: auth.user.id, userId: auth.user.id }),
  ]);

  return (
    <main className="mx-auto w-full max-w-[1680px] space-y-8 px-4 py-8 sm:px-6 lg:px-8 xl:px-10">
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

      <div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] xl:gap-14">
        <AccountSubNav
          label="เมนูโปรไฟล์"
          items={[
            { href: "#identity", label: "ตัวตนของฉัน" },
            { href: "#readiness", label: "ความพร้อมสำหรับจับคู่ทีม" },
            { href: "#skills", label: "ทักษะและเครื่องมือ" },
            { href: "#links", label: "ผลงานและลิงก์" },
            { href: "#contact", label: "การติดต่อและการเปิดเผย" },
          ]}
        />
        <div className="min-w-0 space-y-10">
          <ProfileBadges badges={badges} />
          <VerifiedSkillEvidencePanel skills={skillEvidence} />
          <ProfileForm initialProfile={auth.user} />
        </div>
      </div>
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
