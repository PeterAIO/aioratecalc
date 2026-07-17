"use server";

// DEBUG-ROLE-SWITCHER — see lib/auth/debugRole.ts for the full removal note.
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DEBUG_ROLE_COOKIE, isDebugRoleSwitchEnabled, type DebugRole } from "@/lib/auth/debugRole";

export async function setDebugRoleAction(role: DebugRole | null) {
  if (!isDebugRoleSwitchEnabled()) return; // hard gate — no-op in any real deployment
  const store = await cookies();
  if (role) store.set(DEBUG_ROLE_COOKIE, role, { path: "/" });
  else store.delete(DEBUG_ROLE_COOKIE);
  revalidatePath("/", "layout");
}
