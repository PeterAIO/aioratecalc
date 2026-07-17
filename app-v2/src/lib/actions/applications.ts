"use server";

import { randomUUID } from "crypto";
import { inArray } from "drizzle-orm";
import { postgresStorage } from "@/lib/storage/postgresAdapter";
import { getEffectiveRole } from "@/lib/auth/getEffectiveRole";
import { db } from "@/lib/db/client";
import { customerLoginTokens, users } from "@/lib/db/schema";
import { sendMagicLinkEmail, type SendMagicLinkResult } from "@/lib/adapters/email";
import type { StorageScope } from "@/lib/storage/storageInterface";
import type { MerchantApplication, AppSettings, CustomerSubmission } from "@/types/merchant";

export type RepSummary = { id: string; name: string; email: string };

const MERCHANT_LINK_TTL_DAYS = 14;
const LOGIN_TOKEN_TTL_MINUTES = 30;

async function requireScope(): Promise<StorageScope> {
  const effective = await getEffectiveRole();
  if (!effective) throw new Error("Not authenticated");
  return { userId: effective.userId, role: effective.role };
}

export async function listApplicationsAction(): Promise<MerchantApplication[]> {
  return postgresStorage.listApplications(await requireScope());
}

export async function getApplicationAction(id: string): Promise<MerchantApplication | null> {
  return postgresStorage.getApplication(await requireScope(), id);
}

// Never trusts the client's ownerUserId for a brand-new application — the
// server stamps it from the session on first save. Returns the persisted
// record so the caller's local state stays in sync with what was written.
export async function saveApplicationAction(app: MerchantApplication): Promise<MerchantApplication> {
  const scope = await requireScope();
  const toSave: MerchantApplication = { ...app, ownerUserId: app.ownerUserId || scope.userId };
  await postgresStorage.saveApplication(scope, toSave);
  return toSave;
}

export async function deleteApplicationAction(id: string): Promise<void> {
  await postgresStorage.deleteApplication(await requireScope(), id);
}

export async function getSettingsAction(): Promise<AppSettings> {
  return postgresStorage.getSettings();
}

export async function saveSettingsAction(s: AppSettings): Promise<void> {
  await postgresStorage.saveSettings(await requireScope(), s);
}

export async function listSubmissionsAction(): Promise<CustomerSubmission[]> {
  return postgresStorage.listSubmissions(await requireScope());
}

// Rep/admin-triggered: emails the merchant contact a magic link that logs
// them straight into /customer/applications/{id} to complete Adyen KYC.
// customerLinkToken/Purpose/SentAt/ExpiresAt on the application are
// bookkeeping only (mirrors how the lead_upload purpose uses these same
// fields); the actual short-lived auth mechanism is the customerLoginTokens
// row below, reusing the existing /api/customer/verify route unmodified.
export async function sendMerchantOnboardingLinkAction(id: string): Promise<{ app: MerchantApplication; result: SendMagicLinkResult }> {
  const scope = await requireScope();
  const app = await postgresStorage.getApplication(scope, id);
  if (!app) throw new Error("Application not found");
  const email = app.ownerContact?.email;
  if (!email) throw new Error("No owner contact email on file for this application");

  const now = new Date();
  const updated: MerchantApplication = {
    ...app,
    stage: "merchant_link_sent",
    customerLinkToken: randomUUID(),
    customerLinkPurpose: "kyc_handoff",
    customerLinkSentAt: now.toISOString(),
    customerLinkExpiresAt: new Date(now.getTime() + MERCHANT_LINK_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: now.toISOString(),
  };
  await postgresStorage.saveApplication(scope, updated);

  const loginToken = randomUUID();
  const loginExpiresAt = new Date(now.getTime() + LOGIN_TOKEN_TTL_MINUTES * 60 * 1000);
  await db.insert(customerLoginTokens).values({ email, token: loginToken, applicationId: id, expiresAt: loginExpiresAt });

  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const result = await sendMagicLinkEmail(email, `${base}/api/customer/verify?token=${loginToken}`);

  return { app: updated, result };
}

// Admin-only: lets the admin dashboard show which rep owns each application
// (for commission attribution) without exposing this to reps, who should
// only ever see their own applications, not a directory of other reps.
export async function listRepsAction(): Promise<RepSummary[]> {
  const scope = await requireScope();
  if (scope.role !== "admin") throw new Error("Admin only");
  return db.select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.role, ["rep", "admin"]));
}

export async function markApplicationClosedLostAction(id: string): Promise<MerchantApplication> {
  const scope = await requireScope();
  const app = await postgresStorage.getApplication(scope, id);
  if (!app) throw new Error("Application not found");
  const updated: MerchantApplication = { ...app, stage: "closed_lost", updatedAt: new Date().toISOString() };
  await postgresStorage.saveApplication(scope, updated);
  return updated;
}
