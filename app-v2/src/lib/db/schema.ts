import { pgTable, uuid, text, timestamp, boolean, integer, numeric, jsonb, serial } from "drizzle-orm/pg-core";
import type {
  StatementAnalysis,
  ProposalOutput,
  BusinessInfo,
  OwnerContact,
  ProcessingInfo,
  AgreementInfo,
  Processor,
  AppSettings,
  MerchantApplication,
  CustomerSubmission,
} from "@/types/merchant";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  name: text("name").notNull(),
  role: text("role", { enum: ["rep", "admin", "customer"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
});

// Global, admin-controlled padding policy — the padding applied to the true
// margin floor / Adyen cost before a rep is allowed to see it. See pricing.ts.
export const marginPolicy = pgTable("margin_policy", {
  id: uuid("id").primaryKey().defaultRandom(),
  paddingBps: integer("padding_bps").notNull().default(20),
  paddingMinMrrAdd: numeric("padding_min_mrr_add", { precision: 10, scale: 2 }).notNull().default("0"),
  paddingAdyenCostHide: boolean("padding_adyen_cost_hide").notNull().default(true),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  isActive: boolean("is_active").notNull().default(true),
});

// Replaces localStorage "clearrate:settings" / "clearrate:adyen_config".
export const appSettings = pgTable("app_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  processors: jsonb("processors").$type<Processor[]>().notNull(),
  adyenConfig: jsonb("adyen_config").$type<AppSettings["adyenConfig"] | null>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Replaces localStorage "aio_applications". owner_user_id is the REP who
// owns this deal — distinct from ownerContact (the merchant's own business
// contact person, stored in the ownerContact jsonb column below).
export const merchantApplications = pgTable("merchant_applications", {
  id: text("id").primaryKey(),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id),
  // Set once the customer completes magic-link signup from the lead page —
  // distinct from ownerUserId (the rep) and ownerContact (contact info blob).
  customerUserId: uuid("customer_user_id").references(() => users.id),
  stage: text("stage").notNull(),
  hubspotDealId: text("hubspot_deal_id"),
  // Phase 3 — links this ezacc to the HubSpot Company (AIO tenant). See TenantLink.
  tenantLink: jsonb("tenant_link").$type<MerchantApplication["tenantLink"]>(),
  adyenIds: jsonb("adyen_ids").$type<MerchantApplication["adyenIds"]>(),
  adyenOnboardingUrl: text("adyen_onboarding_url"),
  // Check payroll onboarding. No matching *_onboarding_url column on purpose —
  // Check's onboard links are one-time use / 24h, so they're minted per click
  // and never stored (see src/lib/adapters/check.ts).
  checkIds: jsonb("check_ids").$type<MerchantApplication["checkIds"]>(),
  // HubSpot billing. No stored checkout URL beyond hs_quote_link inside the blob,
  // and that one is re-readable from HubSpot rather than authoritative here.
  // We never write the subscription or its invoices — HubSpot creates both when
  // the customer pays the quote (see E2E-PLAN.md).
  hubspotIds: jsonb("hubspot_ids").$type<MerchantApplication["hubspotIds"]>(),
  // The rep-entered ticket/volume basis for a quote built without a statement.
  quoteConfig: jsonb("quote_config").$type<MerchantApplication["quoteConfig"]>(),
  // Quote lines, priced at quote time. Prices are per BILLING CYCLE (weekly for
  // AIO's platform fees), never per month — see BillingFrequency.
  quoteLines: jsonb("quote_lines").$type<MerchantApplication["quoteLines"]>(),
  analysis: jsonb("analysis").$type<StatementAnalysis | null>(),
  proposal: jsonb("proposal").$type<ProposalOutput | null>(),
  business: jsonb("business").$type<BusinessInfo | null>(),
  ownerContact: jsonb("owner_contact").$type<OwnerContact | null>(),
  processing: jsonb("processing").$type<ProcessingInfo | null>(),
  agreement: jsonb("agreement").$type<AgreementInfo | null>(),
  targetMargin: numeric("target_margin", { precision: 8, scale: 6 }),
  pricingModel: text("pricing_model"),
  // Generalized replacement for the old single-purpose merchantLinkToken/
  // merchantLinkSentAt/merchantLinkExpiry fields: one token slot can't serve
  // both the pre-analysis lead-upload link and the post-proposal Adyen KYC
  // handoff link without colliding, hence the purpose discriminator.
  customerLinkToken: text("customer_link_token").unique(),
  customerLinkPurpose: text("customer_link_purpose", { enum: ["lead_upload", "kyc_handoff"] }),
  customerLinkSentAt: timestamp("customer_link_sent_at", { withTimezone: true }),
  customerLinkExpiresAt: timestamp("customer_link_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Legacy/retired: the old fully-anonymous self-serve flow (customer.html
// equivalent). Kept for historical data only — no new writes after cutover
// to the rep-initiated prospect flow.
export const customerSubmissions = pgTable("customer_submissions", {
  id: serial("id").primaryKey(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  contactInfo: jsonb("contact_info").$type<CustomerSubmission["contactInfo"]>().notNull(),
  analysis: jsonb("analysis").$type<StatementAnalysis>(),
  quote: jsonb("quote").$type<CustomerSubmission["quote"]>(),
});

// Short-lived, single-use passwordless login tokens for the customer role.
// applicationId ties a signup token (from the lead page) to the specific
// deal it should attach to; login tokens requested from /customer/login
// have no applicationId (the customer may have multiple applications).
export const customerLoginTokens = pgTable("customer_login_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  applicationId: text("application_id").references(() => merchantApplications.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
