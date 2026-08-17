"use server";

import { randomUUID } from "crypto";
import { getEffectiveRole } from "@/lib/auth/getEffectiveRole";
import { postgresStorage } from "@/lib/storage/postgresAdapter";
import type { MerchantApplication, PricingModel } from "@/types/merchant";

const LINK_TTL_DAYS = 14;

export async function createProspectAction(input: {
  merchantName: string;
  contactEmail: string;
  targetMargin: number;
  pricingModel: PricingModel;
}): Promise<{ app: MerchantApplication; linkUrl: string }> {
  const effective = await getEffectiveRole();
  if (!effective) throw new Error("Not authenticated");

  const token = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LINK_TTL_DAYS * 24 * 60 * 60 * 1000);

  const app: MerchantApplication = {
    id: `prospect_${now.getTime()}`,
    ownerUserId: effective.userId,
    customerUserId: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    stage: "lead_link_sent",
    hubspotDealId: null,
    tenantLink: null,
    adyenIds: null,
    adyenOnboardingUrl: null,
    checkIds: null,
    hubspotIds: null,
    quoteConfig: null,
    quoteLines: null,
    targetMargin: input.targetMargin,
    pricingModel: input.pricingModel,
    customerLinkToken: token,
    customerLinkPurpose: "lead_upload",
    customerLinkSentAt: now.toISOString(),
    customerLinkExpiresAt: expiresAt.toISOString(),
    analysis: null,
    proposal: null,
    business: {
      legalName: input.merchantName, dba: input.merchantName, bizType: "llc",
      address: "", city: "", state: "", zip: "", phone: "", website: "",
      yearsInBusiness: "", annualRevenue: "",
    },
    ownerContact: { firstName: "", lastName: "", title: "", email: input.contactEmail, phone: "" },
    processing: null,
    agreement: null,
  };

  await postgresStorage.saveApplication({ userId: effective.userId, role: effective.role }, app);

  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  return { app, linkUrl: `${base}/lead/${token}` };
}
