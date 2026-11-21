import {
  Award,
  CheckCircle2,
  FolderCheck,
  GraduationCap,
  Target,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BadgeIconName, UserBadge } from "@/lib/db/badges";

const BADGE_ICONS: Record<BadgeIconName, LucideIcon> = {
  Award,
  Users,
  Target,
  CheckCircle2,
  GraduationCap,
  Trophy,
  FolderCheck,
};

export function BadgeChip({
  badge,
  showIcon = true,
  className,
}: {
  badge: UserBadge;
  showIcon?: boolean;
  className?: string;
}) {
  const Icon = BADGE_ICONS[badge.iconName];

  return (
    <Badge
      variant="outline"
      title={badge.descriptionTh}
      className={cn(
        "h-auto max-w-full gap-1 rounded-md border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground",
        className,
      )}
    >
      {showIcon ? <Icon className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
      <span className="truncate">{badge.nameTh}</span>
    </Badge>
  );
}
