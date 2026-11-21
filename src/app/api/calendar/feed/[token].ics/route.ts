import { handleCalendarFeedRequest } from "@/lib/integrations/calendar-feed-handler";

export const dynamic = "force-dynamic";

/**
 * Next.js treats `[token].ics` as a literal App Router segment, so the token
 * travels in the `feed` query parameter. A canonical dynamic route can reuse
 * handleCalendarFeedRequest with the path token when the parent integrates it.
 */
export async function GET(
  request: Request,
  context?: { params?: Promise<{ token?: string }> },
) {
  const pathToken = (await context?.params)?.token ?? null;
  return handleCalendarFeedRequest(request, pathToken);
}
