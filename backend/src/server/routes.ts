import { getDb, type Db } from "@/db";
import { requireUser } from "./services/auth";
import { handle } from "./http";

type Args<C> = { db: Db; req: Request; ctx: C };

export function publicRoute<C = unknown>(fn: (a: Args<C>) => Promise<Response>) {
  return handle<C>(async (req, ctx) => fn({ db: await getDb(), req, ctx }));
}

export function userRoute<C = unknown>(fn: (a: Args<C> & { userId: string }) => Promise<Response>) {
  return handle<C>(async (req, ctx) => {
    const db = await getDb();
    const { userId } = await requireUser(db, req);
    return fn({ db, req, ctx, userId });
  });
}

export type IdParams = { params: Promise<{ id: string }> };

import { requireAdmin, type AdminContext } from "./adminAuth";
import type { Permission } from "./permissions";

export function adminRoute<C = unknown>(
  permission: Permission | null,
  fn: (a: Args<C> & { admin: AdminContext }) => Promise<Response>,
) {
  return handle<C>(async (req, ctx) => {
    const db = await getDb();
    const admin = await requireAdmin(db, req, permission ?? undefined);
    return fn({ db, req, ctx, admin });
  });
}
