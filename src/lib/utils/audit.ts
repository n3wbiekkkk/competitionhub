import { withSystemDb } from "@/lib/db/pool";

export interface AuditInput {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  await withSystemDb(async (client) => {
    await client.query(
      `insert into public.audit_logs
         (actor_id, action, target_type, target_id, metadata, ip_address)
       values ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        input.actorId,
        input.action,
        input.targetType,
        input.targetId ?? null,
        JSON.stringify(input.metadata ?? {}),
        input.ipAddress ?? null,
      ],
    );
  });
}
