import { BadgeChip } from "@/components/badges/badge-chip";
import type { UserBadge } from "@/lib/db/badges";

export function PeopleBadgeStrip({
  badges,
  max = 3,
}: {
  badges: UserBadge[];
  max?: number;
}) {
  if (badges.length === 0) return null;

  const visible = badges.slice(0, Math.max(max, 0));
  const hiddenCount = badges.length - visible.length;

  return (
    <ul className="mt-2 flex flex-wrap gap-1" aria-label="ตราเกียรติยศ">
      {visible.map((badge) => (
        <li key={badge.code}>
          <BadgeChip badge={badge} className="text-[10px]" />
        </li>
      ))}
      {hiddenCount > 0 ? (
        <li className="inline-flex h-auto items-center rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground">
          +{hiddenCount}
        </li>
      ) : null}
    </ul>
  );
}
