import { requireAuthUser } from "@/lib/auth/cookies";
import { loadRealtimeEvents } from "@/lib/realtime/server";

export const dynamic = "force-dynamic";

/** Reconnect fallback for clients whose EventSource cannot hold a stream. */
export async function GET(request: Request) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }
  const since = new URL(request.url).searchParams.get("since");
  const result = await loadRealtimeEvents({ userId: auth.user.id, since });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
