import { realtimeEventSchema, type RealtimeEvent } from "./types";

export interface DeliveryContext {
  userId: string;
  teamIds: ReadonlySet<string>;
}

export function encodeSseFrame(event: RealtimeEvent): string {
  const name = event.kind === "heartbeat" ? "heartbeat" : "update";
  return `id: ${event.id}\nevent: ${name}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function parseRealtimeEvent(raw: string): RealtimeEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = realtimeEventSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function shouldDeliverEvent(event: RealtimeEvent, context: DeliveryContext): boolean {
  switch (event.kind) {
    case "ready":
    case "heartbeat":
      return true;
    case "notification":
      return event.userId === context.userId;
    case "team_message":
    case "team_task":
    case "team_checkin":
      return context.teamIds.has(event.teamId);
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

/** Keeps a bounded view of already-delivered event ids across stream reconnects. */
export function dedupeEvents(
  events: readonly RealtimeEvent[],
  seen: ReadonlySet<string>,
): { events: RealtimeEvent[]; seen: Set<string> } {
  const nextSeen = new Set(seen);
  const unique = events.filter((event) => {
    if (nextSeen.has(event.id)) return false;
    nextSeen.add(event.id);
    return true;
  });
  return { events: unique, seen: nextSeen };
}

export function advanceCursor(current: string, events: readonly RealtimeEvent[]): string {
  let latest = current;
  for (const event of events) {
    if (event.kind === "ready" || event.kind === "heartbeat") continue;
    if (event.createdAt > latest) latest = event.createdAt;
  }
  return latest;
}
