import { NavbarClient } from "@/components/layout/navbar-client";
import { getAuthenticatedProfile } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";

export async function Navbar() {
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

  return <NavbarClient user={user} pendingReviewCount={pendingReviewCount} />;
}
