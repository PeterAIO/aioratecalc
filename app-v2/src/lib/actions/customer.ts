"use server";

import { randomUUID } from "crypto";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { customerLoginTokens, users } from "@/lib/db/schema";
import { postgresStorage } from "@/lib/storage/postgresAdapter";
import { sendMagicLinkEmail, type SendMagicLinkResult } from "@/lib/adapters/email";
import { createLegalEntityAndGetOnboardingUrl, updateLegalEntity } from "@/lib/adapters/adyen";
import {
  checkEnvironment,
  createCheckCompany,
  createCheckOnboardLink,
  getCheckOnboardStatus,
  type PayrollSigner,
} from "@/lib/adapters/check";
import { pushToHubSpot } from "@/lib/adapters/hubspot";
import { buildCustomerSafeQuote } from "@/lib/leadQuote";
import { validateOnboardingFields, type OnboardingFieldErrors } from "@/lib/onboardingValidation";
import { usStateCode } from "@/lib/utils";
import type {
  MerchantApplication, BusinessInfo, OwnerContact, ProcessingInfo, AgreementInfo, CustomerSafeQuote,
} from "@/types/merchant";

const LOGIN_TOKEN_TTL_MINUTES = 30;

// The onboarding form's State box is free text, so a customer can type
// "California". adapters/adyen.ts normalizes on the way out, but Check and
// HubSpot read app.business.state as-is — so normalize once, here, and persist
// the USPS code every consumer expects.
function withStateCode(business: BusinessInfo): BusinessInfo {
  return { ...business, state: usStateCode(business.state) ?? "" };
}

async function requireCustomer(): Promise<{ userId: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== "customer") throw new Error("Not authenticated");
  return { userId: session.user.id };
}

// Returning-visitor login (no specific application context). Deliberately
// does NOT create a new user for an unknown/non-customer email — avoids
// orphan accounts and email enumeration from a bare login screen. Always
// responds the same way regardless of whether the email matched.
export async function requestCustomerLoginAction(email: string): Promise<SendMagicLinkResult> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || user.role !== "customer" || user.disabledAt) {
    return { sent: true, devUrl: null };
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + LOGIN_TOKEN_TTL_MINUTES * 60 * 1000);
  await db.insert(customerLoginTokens).values({ email, token, expiresAt });

  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  return sendMagicLinkEmail(email, `${base}/api/customer/verify?token=${token}`);
}

// Password sign-in for customers who've set one — skips the magic-link round
// trip entirely. Customers without a password yet should use the "email me
// a link" path on /customer/login instead.
export async function customerLoginAction(formData: FormData): Promise<string | undefined> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/customer",
    });
  } catch (error) {
    if (error instanceof AuthError) return "Invalid email or password";
    throw error; // rethrow the internal NEXT_REDIRECT "error" so navigation still happens
  }
}

// Lets an already-authenticated customer set (or change) their password, so
// future sign-ins don't require requesting a fresh magic link every time.
export async function setCustomerPasswordAction(password: string): Promise<void> {
  const { userId } = await requireCustomer();
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  const passwordHash = await hash(password, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function listMyApplicationsAction(): Promise<MerchantApplication[]> {
  const { userId } = await requireCustomer();
  return postgresStorage.listApplicationsForCustomer(userId);
}

export async function getMyApplicationAction(id: string): Promise<MerchantApplication | null> {
  const { userId } = await requireCustomer();
  return postgresStorage.getApplicationForCustomer(userId, id);
}

// The quote the customer accepted, re-projected for their signed-in dashboard.
// Loads through getApplicationForCustomer, which scopes on customerUserId, so
// an id belonging to someone else simply doesn't resolve — same gate as
// getMyApplicationAction. Returns the CustomerSafeQuote and nothing else: the
// application row it was built from never crosses to the client.
// Null means "no quote to show" — either the id isn't theirs, or the row has no
// statement and no rep-entered configs to price from (hasQuoteBasis).
export async function getMyQuoteAction(id: string): Promise<CustomerSafeQuote | null> {
  const { userId } = await requireCustomer();
  const app = await postgresStorage.getApplicationForCustomer(userId, id);
  if (!app) return null;
  return buildCustomerSafeQuote({
    analysis: app.analysis,
    quoteConfig: app.quoteConfig,
    targetMargin: app.targetMargin,
    pricingModel: app.pricingModel,
    quoteLines: app.quoteLines,
    orderPoints: app.orderPoints,
  });
}

// Saves the customer's self-serve business/owner/processing/agreement
// details, then chains into Adyen (legal entity + hosted onboarding URL) and
// HubSpot (deal sync). Both are caught independently and logged rather than
// thrown — ADYEN_LEM_API_KEY/HUBSPOT_PRIVATE_APP_TOKEN aren't configured yet,
// and a missing-credential error there shouldn't block the customer's save
// or surface a 500 to them.
//
// Adyen is validated against BEFORE it's called: this is the real gate, since
// the client-side copy of the same rules is bypassable. The customer's input is
// still saved when validation fails — losing what they typed would be worse
// than the rejection — but the stage doesn't advance, because onboarding hasn't
// started. `fieldErrors` (validation, the customer can fix it) and `adyenFailed`
// (our side broke) are separate outcomes and the form renders them differently.
export async function saveMyApplicationOnboardingAction(
  id: string,
  fields: { business: BusinessInfo; ownerContact: OwnerContact; processing: ProcessingInfo; agreement: AgreementInfo }
): Promise<{
  app: MerchantApplication;
  adyenReady: boolean;
  fieldErrors: OnboardingFieldErrors | null;
  adyenFailed: boolean;
}> {
  const { userId } = await requireCustomer();
  const existing = await postgresStorage.getApplicationForCustomer(userId, id);
  if (!existing) throw new Error("Application not found");

  const errors = validateOnboardingFields({ business: fields.business, ownerContact: fields.ownerContact });
  const hasFieldErrors = Object.keys(errors).length > 0;

  let app = await postgresStorage.updateApplicationAsCustomer(userId, id, {
    business: withStateCode(fields.business),
    ownerContact: fields.ownerContact,
    processing: fields.processing,
    agreement: fields.agreement,
    ...(hasFieldErrors ? {} : { stage: "merchant_filling" as const }),
  });

  let adyenReady = false;
  let adyenFailed = false;
  if (!hasFieldErrors) {
    try {
      const result = await createLegalEntityAndGetOnboardingUrl(app);
      app = await postgresStorage.updateApplicationAsCustomer(userId, id, {
        adyenIds: {
          legalEntityId: result.legalEntityId,
          accountHolderId: result.accountHolderId,
          balanceAccountId: result.balanceAccountId,
          merchantAccountId: null, // set to the shared POS merchant account when the store is created (tenant number known)
          storeId: null,
          businessLineId: result.businessLineId,
          tenantNumber: null,
          environment: process.env.ADYEN_ENVIRONMENT === "live" ? "live" : "test",
        },
        adyenOnboardingUrl: result.onboardingUrl,
        stage: "adyen_kyc_pending",
      });
      adyenReady = Boolean(result.onboardingUrl);
      adyenFailed = !adyenReady;
    } catch (err) {
      console.error("Adyen onboarding failed:", err instanceof Error ? err.message : err);
      adyenFailed = true;
    }
  }

  try {
    const dealId = await pushToHubSpot(app);
    app = await postgresStorage.updateApplicationAsCustomer(userId, id, { hubspotDealId: dealId });
  } catch (err) {
    console.error("HubSpot sync not available yet:", err instanceof Error ? err.message : err);
  }

  return { app, adyenReady, fieldErrors: hasFieldErrors ? errors : null, adyenFailed };
}

// Edits after the first submission — e.g. after Adyen onboarding has already
// started. Doesn't touch stage (editing shouldn't regress/advance the deal's
// state machine) and pushes the change to Adyen/HubSpot if those already
// have a record for this application, same fire-and-log convention as above.
export async function updateMyApplicationDetailsAction(
  id: string,
  fields: { business: BusinessInfo; ownerContact: OwnerContact; processing: ProcessingInfo; agreement: AgreementInfo }
): Promise<{ app: MerchantApplication; adyenSynced: boolean }> {
  const { userId } = await requireCustomer();
  const existing = await postgresStorage.getApplicationForCustomer(userId, id);
  if (!existing) throw new Error("Application not found");

  let app = await postgresStorage.updateApplicationAsCustomer(userId, id, {
    business: withStateCode(fields.business),
    ownerContact: fields.ownerContact,
    processing: fields.processing,
    agreement: fields.agreement,
  });

  let adyenSynced = false;
  if (app.adyenIds?.legalEntityId) {
    try {
      await updateLegalEntity(app.adyenIds.legalEntityId, app);
      adyenSynced = true;
    } catch (err) {
      console.error("Adyen legal entity update not available yet:", err instanceof Error ? err.message : err);
    }
  }

  try {
    const dealId = await pushToHubSpot(app);
    app = await postgresStorage.updateApplicationAsCustomer(userId, id, { hubspotDealId: dealId });
  } catch (err) {
    console.error("HubSpot sync not available yet:", err instanceof Error ? err.message : err);
  }

  return { app, adyenSynced };
}

// ── Payroll (Check) ─────────────────────────────────────────────────────────
// Opt-in, unlike Adyen: nothing is sent to Check until the customer starts the
// payroll module themselves, so merchants who don't want AIO payroll never get
// a Check company. Errors here DO throw (the customer clicked a button and is
// waiting on a link) rather than following the fire-and-log convention the
// Adyen/HubSpot chaining above uses.

// Creates the Check company and returns the first onboard link. The signer is
// whoever is authorized to onboard for the company; startDate is their first
// payday on Check, which we can't derive from anything AIO stores.
export async function startPayrollOnboardingAction(
  id: string,
  fields: { startDate: string; signer: PayrollSigner }
): Promise<{ url: string }> {
  const { userId } = await requireCustomer();
  const app = await postgresStorage.getApplicationForCustomer(userId, id);
  if (!app) throw new Error("Application not found");
  if (!app.business || !app.ownerContact) {
    throw new Error("Add your business details before setting up payroll");
  }

  // Already opted in — hand back a fresh link instead of creating a second
  // Check company for the same merchant.
  if (app.checkIds?.companyId) {
    return { url: await createCheckOnboardLink(app.checkIds.companyId, app.checkIds.signer) };
  }

  const companyId = await createCheckCompany(app, fields.startDate);
  await postgresStorage.updateApplicationAsCustomer(userId, id, {
    checkIds: {
      companyId,
      environment: checkEnvironment(),
      startDate: fields.startDate,
      signer: fields.signer,
      createdAt: new Date().toISOString(),
      onboardStatus: null,
      onboardStatusAt: null,
    },
  });

  return { url: await createCheckOnboardLink(companyId, fields.signer) };
}

// Loads the application and refreshes its cached Check onboard status.
// Check's onboard links have no redirect-back URL, so the customer never
// returns through AIO after finishing — viewing the application is the only
// reliable moment to re-read status. Takes an id and re-loads server-side
// rather than accepting an application object: this is a Server Action, so a
// caller-supplied app would let a client forge the companyId it queries.
// Failures are swallowed — a Check outage must not break the application page.
export async function getMyApplicationWithPayrollSyncAction(id: string): Promise<MerchantApplication | null> {
  const { userId } = await requireCustomer();
  const app = await postgresStorage.getApplicationForCustomer(userId, id);
  if (!app?.checkIds?.companyId || app.checkIds.onboardStatus === "completed") return app;

  try {
    const onboardStatus = await getCheckOnboardStatus(app.checkIds.companyId);
    if (onboardStatus === app.checkIds.onboardStatus) return app;
    return await postgresStorage.updateApplicationAsCustomer(userId, id, {
      checkIds: { ...app.checkIds, onboardStatus, onboardStatusAt: new Date().toISOString() },
    });
  } catch (err) {
    console.error("Check onboard status refresh failed:", err instanceof Error ? err.message : err);
    return app;
  }
}
