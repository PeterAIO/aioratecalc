// DEBUG-ROLE-SWITCHER: temporary, dev-only affordance so Shaheer can click
// through Rep/Admin views without logging in/out. Hard-gated on
// ENABLE_DEBUG_ROLE_SWITCH, which must only ever be set in a local
// .env.local — never in any Vercel project environment (Preview builds also
// run with NODE_ENV=production, so gating on NODE_ENV alone isn't reliable).
// Safe to delete: this file, src/lib/actions/debugRole.ts,
// src/components/dev/RoleSwitcher.tsx, and their call sites in
// src/middleware.ts + src/app/layout.tsx.
//
// Pure/isomorphic on purpose (no next/headers, no "server-only") — it must
// be importable from middleware, which uses NextRequest's cookie API, not
// next/headers.

export const DEBUG_ROLE_COOKIE = "debug_role";
export type DebugRole = "rep" | "admin";

export function isDebugRoleSwitchEnabled(): boolean {
  return process.env.ENABLE_DEBUG_ROLE_SWITCH === "true";
}

export function parseDebugRole(value: string | undefined | null): DebugRole | null {
  return value === "rep" || value === "admin" ? value : null;
}
