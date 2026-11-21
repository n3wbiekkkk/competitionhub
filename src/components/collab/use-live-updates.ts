"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { nextRetryDelay, normalizeCursor } from "@/lib/realtime/cursor";
import { advanceCursor, dedupeEvents, parseRealtimeEvent } from "@/lib/realtime/protocol";
import { realtimeEventSchema, type LiveStatus, type RealtimeEvent } from "@/lib/realtime/types";

const POLL_FALLBACK_MS = 5_000;
const SEEN_LIMIT = 500;

const pollResponseSchema = z.object({
  events: z.array(realtimeEventSchema),
  serverTime: z.string(),
});

export interface UseLiveUpdatesOptions {
  enabled?: boolean;
  since?: string | null;
  onEvent?: (event: RealtimeEvent) => void;
}

export interface LiveUpdatesResult {
  status: LiveStatus;
  lastEventAt: string | null;
  retry: () => void;
}

/**
 * One SSE connection with bounded reconnect backoff. After two failures it
 * keeps a scoped polling fallback alive while it retries the stream.
 */
export function useLiveUpdates({
  enabled = true,
  since,
  onEvent,
}: UseLiveUpdatesOptions = {}): LiveUpdatesResult {
  const [status, setStatus] = useState<LiveStatus>(enabled ? "connecting" : "offline");
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const onEventRef = useRef(onEvent);
  const cursorRef = useRef(normalizeCursor(since));
  const seenRef = useRef(new Set<string>());
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retryRef = useRef<() => void>(() => {});

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const deliver = useCallback((events: readonly RealtimeEvent[]) => {
    const dataEvents = events.filter(
      (event) => event.kind !== "ready" && event.kind !== "heartbeat",
    );
    if (dataEvents.length === 0) return;

    const deduped = dedupeEvents(dataEvents, seenRef.current);
    seenRef.current = deduped.seen;
    if (seenRef.current.size > SEEN_LIMIT) {
      const overflow = seenRef.current.size - SEEN_LIMIT;
      for (const id of [...seenRef.current].slice(0, overflow)) seenRef.current.delete(id);
    }
    cursorRef.current = advanceCursor(cursorRef.current, dataEvents);

    for (const event of deduped.events) {
      const at = event.kind === "ready" || event.kind === "heartbeat" ? event.at : event.createdAt;
      setLastEventAt(at);
      onEventRef.current?.(event);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    cursorRef.current = normalizeCursor(since);
    seenRef.current = new Set();

    let disposed = false;
    let source: EventSource | null = null;
    let controller: AbortController | null = null;
    let polling = false;
    let pollingInFlight = false;
    let failures = 0;
    let reconnectAttempt = 0;

    const stopStream = () => {
      if (!source) return;
      source.close();
      source = null;
    };

    const stopPolling = () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = undefined;
      }
      controller?.abort();
      controller = null;
      polling = false;
    };

    const startPolling = () => {
      if (disposed || polling) return;
      polling = true;
      controller = new AbortController();
      const run = async () => {
        if (disposed || pollingInFlight) return;
        pollingInFlight = true;
        try {
          const url = `/api/events/stream/poll?since=${encodeURIComponent(cursorRef.current)}`;
          const response = await fetch(url, {
            cache: "no-store",
            signal: controller?.signal,
          });
          if (!response.ok) {
            setStatus("offline");
            return;
          }
          const parsed = pollResponseSchema.safeParse(await response.json());
          if (!parsed.success) return;
          deliver(parsed.data.events);
          setStatus("polling");
        } catch {
          if (!disposed) setStatus("offline");
        } finally {
          pollingInFlight = false;
        }
      };
      void run();
      pollTimerRef.current = setInterval(() => void run(), POLL_FALLBACK_MS);
    };

    const startStream = () => {
      if (disposed) return;
      stopPolling();
      const url = `/api/events/stream?since=${encodeURIComponent(cursorRef.current)}`;
      const nextSource = new EventSource(url);
      source = nextSource;

      const handleUpdate = (event: MessageEvent<string>) => {
        const parsed = parseRealtimeEvent(event.data);
        if (!parsed) return;
        if (parsed.kind === "ready") {
          failures = 0;
          reconnectAttempt = 0;
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = undefined;
          }
          stopPolling();
          setStatus("live");
          return;
        }
        if (parsed.kind === "heartbeat") {
          setStatus("live");
          return;
        }
        deliver([parsed]);
      };

      const handleHeartbeat = () => setStatus("live");
      nextSource.addEventListener("update", handleUpdate);
      nextSource.addEventListener("heartbeat", handleHeartbeat);
      nextSource.onerror = () => {
        if (disposed || source !== nextSource) return;
        failures += 1;
        stopStream();
        if (failures >= 2) {
          startPolling();
          setStatus("polling");
        }
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        const delay = nextRetryDelay(reconnectAttempt + 1);
        reconnectAttempt += 1;
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = undefined;
          startStream();
        }, delay);
      };
    };

    retryRef.current = () => {
      failures = 0;
      reconnectAttempt = 0;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = undefined;
      }
      stopStream();
      startStream();
    };

    startStream();

    return () => {
      disposed = true;
      stopStream();
      stopPolling();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = undefined;
      }
    };
  }, [deliver, enabled, since]);

  const retry = useCallback(() => retryRef.current(), []);

  return { status: enabled ? status : "offline", lastEventAt, retry };
}
