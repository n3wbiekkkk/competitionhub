import { BadgeCheck } from "lucide-react";
import type { VerifiedSkillEvidence } from "@/lib/db/badges";

export function VerifiedSkillEvidencePanel({
  skills,
  title = "ทักษะที่มีหลักฐานรับรอง",
  description = "นับจากการแข่งขันที่เสร็จสิ้นและอาจารย์รับรองผลแล้วเท่านั้น",
}: {
  skills: VerifiedSkillEvidence[];
  title?: string;
  description?: string;
}) {
  return (
    <section className="space-y-4" aria-label={title}>
      <div className="space-y-1 border-b border-border pb-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {skills.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          ยังไม่มีหลักฐานทักษะที่รับรองแล้ว
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {skills.map((item) => (
            <li
              key={item.skill}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="space-y-1">
                <p className="flex items-center gap-2 font-mono text-sm text-foreground">
                  <BadgeCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                  {item.skill}
                </p>
                {item.roleLabels.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    บทบาทในทีม: {item.roleLabels.join(", ")}
                  </p>
                ) : null}
              </div>
              <p className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {item.evidenceCount} รายการ
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
