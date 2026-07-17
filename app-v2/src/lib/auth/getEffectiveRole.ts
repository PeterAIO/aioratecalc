import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { DEBUG_ROLE_COOKIE, isDebugRoleSwitchEnabled, parseDebugRole, type DebugRole } from "./debugRole";

export type EffectiveRole = { role: DebugRole; userId: string; name: string; isDebug: boolean };

// DEBUG-ROLE-SWITCHER: Server Components/Actions should call this instead of
// auth() directly when they need to render differently per role, so the
// debug override (local dev only) and the real session both flow through
// one place. See lib/auth/debugRole.ts for the removal note.
//
// A debug role resolves to the real seeded dev account's DB id (not a fake
// string) because merchant_applications.owner_user_id is a strict FK — any
// data written while impersonating must attribute to a real users row.
// This assumes the seed convention in scripts/seed-users.ts (<role>@aioapp.com).
export async function getEffectiveRole(): Promise<EffectiveRole | null> {
  if (isDebugRoleSwitchEnabled()) {
    const store = await cookies();
    const debugRole = parseDebugRole(store.get(DEBUG_ROLE_COOKIE)?.value);
    if (debugRole) {
      const [user] = await db.select().from(users).where(eq(users.email, `${debugRole}@aioapp.com`)).limit(1);
      if (user) return { role: debugRole, userId: user.id, name: `${user.name} (debug)`, isDebug: true };
    }
  }
  const session = await auth();
  if (!session?.user?.role) return null;
  // This resolver is rep/admin-only — a customer session has no rep/admin
  // scope to resolve to. Customer routes/actions call auth() directly.
  if (session.user.role !== "rep" && session.user.role !== "admin") return null;
  return { role: session.user.role, userId: session.user.id, name: session.user.name ?? "", isDebug: false };
}
