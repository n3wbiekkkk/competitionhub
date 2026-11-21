import { randomUUID } from "node:crypto";

const activeStreams = new Set<string>();

/**
 * Registers one live SSE response and returns its one-shot release function.
 * The counter is process-local; call the release in the stream's finally block.
 */
export function trackSseStream(signal?: AbortSignal): () => void {
  const streamId = randomUUID();
  activeStreams.add(streamId);
  let released = false;

  const release = () => {
    if (released) return;
    released = true;
    activeStreams.delete(streamId);
    signal?.removeEventListener("abort", release);
  };

  signal?.addEventListener("abort", release, { once: true });
  return release;
}

export function getActiveSseStreamCount(): number {
  return activeStreams.size;
}
