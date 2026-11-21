import { z } from "zod";
import { withSystemDb } from "@/lib/db/pool";
import { internalHref } from "./server";

const notificationSchema = z.object({
  userId: z.string().uuid(),
  kind: z.string().min(1).max(40),
  title: z.string().min(1).max(200),
  body: z.string().max(500).nullable(),
  href: z.string().max(300).nullable(),
  dedupeKey: z.string().min(1).max(200),
});

export type CollabNotification = z.infer<typeof notificationSchema>;

/**
 * Notification rows are system-owned. Callers must finish their RBAC check
 * before passing anything here.
 */
export async function createCollabNotifications(
  items: readonly CollabNotification[],
): Promise<void> {
  const parsed = z.array(notificationSchema).max(50).safeParse(items);
  if (!parsed.success || parsed.data.length === 0) return;

  await withSystemDb(async (client) => {
    for (const item of parsed.data) {
      await client.query(
        `insert into public.notifications
           (user_id, kind, title, body, href, team_id, dedupe_key)
         values ($1, $2, $3, $4, $5, null, $6)
         on conflict (user_id, dedupe_key) do nothing`,
        [
          item.userId,
          item.kind,
          item.title,
          item.body,
          item.href ? internalHref(item.href) : null,
          item.dedupeKey,
        ],
      );
    }
  });
}
