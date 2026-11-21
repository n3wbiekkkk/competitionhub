import { handleCalendarFeedRequest } from "@/lib/integrations/calendar-feed-handler";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const raw = (await params).token;
  const token = raw.endsWith(".ics") ? raw.slice(0, -4) : raw;
  return handleCalendarFeedRequest(request, token);
}
