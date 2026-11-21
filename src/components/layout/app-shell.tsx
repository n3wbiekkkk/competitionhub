import { getAuthenticatedProfile } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";
import { AppShellClient } from "@/components/layout/app-shell-client";
import type { ReactNode } from "react";

export async function AppShell({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedProfile();
  let pendingReviewCount = 0;

  if (user?.role === "teacher") {
    try {
      pendingReviewCount = await withUserDb(user.id, async (client) => {
        const res = await client.query<{ total: string }>(
          "SELECT count(*)::text AS total FROM public.competitions WHERE status = 'pending_review'",
        );
        return Number(res.rows[0]?.total ?? 0);
      });
    } catch {
      pendingReviewCount = 0;
    }
  }

  return (
    <AppShellClient user={user} pendingReviewCount={pendingReviewCount}>
      {children}
    </AppShellClient>
  );
}
