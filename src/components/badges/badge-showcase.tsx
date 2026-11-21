import { Award, LockKeyhole } from "lucide-react";
import { BadgeChip } from "@/components/badges/badge-chip";
import type { BadgeTier, UserBadge } from "@/lib/db/badges";

const TIER_LABELS_TH: Record<BadgeTier, string> = {
  bronze: "ระดับทองแดง",
  silver: "ระดับเงิน",
  gold: "ระดับทอง",
};

export function BadgeShowcase({
  badges,
  totalDefinitions,
  title = "ตราเกียรติยศที่ได้รับ",
  description = "ตรารับรองจากหลักฐานการเข้าร่วมและผลงานภายในโรงเรียน",
  emptyMessage = "ยังไม่มีตราเกียรติยศ เริ่มจากการแสดงความสนใจรายการแข่งขัน",
  compact = false,
}: {
  badges: UserBadge[];
  totalDefinitions?: number;
  title?: string;
  description?: string;
  emptyMessage?: string;
  compact?: boolean;
}) {
  const lockedCount =
    totalDefinitions === undefined
      ? null
      : Math.max(totalDefinitions - badges.length, 0);

  return (
    <section className="space-y-4" aria-label={title}>
      <div className="space-y-1 border-b border-border pb-3">
        <h2 className="text-base font-semibold text-foreground">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {badges.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Award className="h-4 w-4" aria-hidden="true" />
          {emptyMessage}
        </p>
      ) : compact ? (
        <ul className="flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <li key={badge.code}>
              <BadgeChip badge={badge} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-border">
          {badges.map((badge) => (
            <li
              key={badge.code}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <BadgeChip badge={badge} showIcon={false} />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{badge.nameTh}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {badge.descriptionTh}
                  </p>
                </div>
              </div>
              <div className="shrink-0 space-y-1 text-right text-[11px] text-muted-foreground">
                <p>{TIER_LABELS_TH[badge.tier]}</p>
                <p className="font-mono tabular-nums">
                  หลักฐาน {badge.evidenceCount}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {lockedCount !== null && lockedCount > 0 ? (
        <p className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
          ยังมีอีก {lockedCount} ตราที่รอการสะสมหลักฐาน
        </p>
      ) : null}
    </section>
  );
}
