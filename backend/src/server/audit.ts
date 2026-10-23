import type { Db } from "@/db";
import { auditLogs } from "@/db/schema";

const SENSITIVE = /(secret|password|token|hash|key|otp)/i;

/** Remove anything that looks like a credential before it reaches the audit log. */
export function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SENSITIVE.test(k) ? "[redacted]" : scrub(v)]),
    );
  }
  return value;
}

export type AuditActor = { id: string; email: string } | null;

export async function audit(
  db: Db,
  actor: AuditActor,
  action: string,
  entity: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
  ip?: string | null,
) {
  await db.insert(auditLogs).values({
    adminId: actor?.id ?? null,
    adminEmail: actor?.email ?? null,
    action,
    entity,
    entityId,
    before: before === undefined || before === null ? null : scrub(before),
    after: after === undefined || after === null ? null : scrub(after),
    ip: ip ?? null,
  });
}
