"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { signIn, signOut } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export async function loginAction(formData: FormData): Promise<string | undefined> {
  const email = String(formData.get("email") ?? "");
  try {
    await signIn("credentials", {
      email,
      password: formData.get("password"),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return "Invalid email or password";
    }
    throw error; // rethrow the internal redirect "error" so navigation still happens
  }
  // Route by role: a customer who signs in on the staff /login page must land
  // on /customer, not /rep — otherwise middleware bounces them straight back
  // to /login and it looks like the form just "reloads".
  const [u] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  // Staff land on their dashboard (the "Accounts" home), not straight into the
  // creation wizard — the wizard is one click away via "New Account" in the nav.
  redirect(u?.role === "customer" ? "/customer" : "/rep");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
