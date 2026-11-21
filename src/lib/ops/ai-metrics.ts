import { writeAudit } from "@/lib/utils/audit";

export interface AiCallMetric {
  actorId?: string | null;
  operation: "extract" | "discovery" | "scout";
  ok: boolean;
  durationMs: number;
}

/**
 * Emits a non-secret AI counter row into the existing audit_logs table.
 * Keep metadata limited to numbers and fixed labels: no prompts, keys or URLs.
 */
export async function recordAiCall(metric: AiCallMetric): Promise<void> {
  await writeAudit({
    actorId: metric.actorId ?? null,
    action: "ai.request",
    targetType: metric.operation,
    metadata: {
      provider: "opentyphoon",
      duration_ms: Math.max(0, Math.round(metric.durationMs)),
      ok: metric.ok,
    },
  });
}
