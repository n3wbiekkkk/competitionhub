import { BadgeShowcase } from "@/components/badges/badge-showcase";
import type { UserBadge } from "@/lib/db/badges";

export function ProfileBadges({
  badges,
  totalDefinitions,
}: {
  badges: UserBadge[];
  totalDefinitions?: number;
}) {
  return (
    <BadgeShowcase
      badges={badges}
      totalDefinitions={totalDefinitions}
      compact
      title="ตราเกียรติยศของฉัน"
      description="ตราที่ระบบออกให้จากหลักฐานการเข้าร่วมและผลงานที่รับรองแล้ว"
      emptyMessage="ยังไม่มีตราเกียรติยศ แสดงความสนใจรายการแข่งขันเพื่อเริ่มสะสมหลักฐาน"
    />
  );
}
