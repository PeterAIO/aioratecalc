"use server";

import { eq, inArray } from "drizzle-orm";
import { hash } from "bcryptjs";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getEffectiveRole } from "@/lib/auth/getEffectiveRole";

// Staff role — the only roles an admin can assign through user management.
// "customer" is excluded on purpose: customer accounts are created
// automatically via magic-link signup (see auth.ts), never hand-assigned,
// so they can't cross over into/out of the staff roster here.
export type StaffRole = "rep" | "admin";

export type AdminUserSummary = {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  createdAt: string;
  disabledAt: string | null;
};

type UserRow = typeof users.$inferSelect;

function rowToSummary(row: UserRow): AdminUserSummary {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as StaffRole,
    createdAt: row.createdAt.toISOString(),
    disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
  };
}

async function requireAdmin() {
  const effective = await getEffectiveRole();
  if (!effective || effective.role !== "admin") throw new Error("Admin only");
  return effective;
}

// Reps + admins only — the staff roster. Customer accounts are managed via
// their applications (see the Customers tab / listApplicationsAction), not here.
export async function listStaffUsersAction(): Promise<AdminUserSummary[]> {
  await requireAdmin();
  const rows = await db.select().from(users).where(inArray(users.role, ["rep", "admin"]));
  return rows.map(rowToSummary);
}

export async function createUserAction(input: {
  email: string;
  name: string;
  role: StaffRole;
  password: string;
}): Promise<AdminUserSummary> {
  await requireAdmin();
  const passwordHash = await hash(input.password, 10);
  const [row] = await db
    .insert(users)
    .values({ email: input.email, name: input.name, role: input.role, passwordHash })
    .returning();
  return rowToSummary(row);
}

export async function updateUserRoleAction(id: string, role: StaffRole): Promise<AdminUserSummary> {
  const effective = await requireAdmin();
  if (id === effective.userId) throw new Error("Cannot change your own role");
  const [row] = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
  if (!row) throw new Error("User not found");
  return rowToSummary(row);
}

export async function setUserDisabledAction(id: string, disabled: boolean): Promise<AdminUserSummary> {
  const effective = await requireAdmin();
  if (id === effective.userId && disabled) throw new Error("Cannot disable your own account");
  const [row] = await db
    .update(users)
    .set({ disabledAt: disabled ? new Date() : null })
    .where(eq(users.id, id))
    .returning();
  if (!row) throw new Error("User not found");
  return rowToSummary(row);
}

export async function resetUserPasswordAction(id: string, password: string): Promise<void> {
  await requireAdmin();
  const passwordHash = await hash(password, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, id));
}
