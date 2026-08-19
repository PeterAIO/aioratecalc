"use server";

import { randomUUID } from "crypto";
import { getEffectiveRole } from "@/lib/auth/getEffectiveRole";
import { postgresStorage } from "@/lib/storage/postgresAdapter";
import {
  getCompanyOwnerContact, getCompanyProfile,
  type HubspotCompanyProfile, type TenantCompany,
} from "@/lib/adapters/hubspot";
import { buildProspectPrefill, type ProspectPrefill } from "@/lib/hubspotPrefill";
import { listQuotableProductsAction } from "@/lib/actions/catalog";
import { hasQuoteBasis } from "@/lib/leadQuote";
import { deriveOrderPoints, resolvePlatformTier, toQuoteLine } from "@/lib/quoting";
import type {
  MerchantApplication, OrderPoints, PricingModel, ProcessingInfo, QuoteConfig, QuoteLine,
  StatementAnalysis, TenantLink,
} from "@/types/merchant";

const LINK_TTL_DAYS = 14;

// ── Phase F: "Push to EasyOB" deep link from the HubSpot Company record ─────
// A CRM card on the Company links out to /rep/prospects/new?hubspotCompanyId={id}.
// The form fetches this server-side to prefill business name/contact and to
// stamp tenantLink onto the new application from day one, instead of the
// manual/late attach flow in applications.ts. Read-only — never writes HubSpot.

// `company` stays a TenantCompany as far as callers are concerned (the profile
// is a superset), so the tenant-link badge and the picker path are unaffected;
// `prefill` is the new, mapped form data.
export type ProspectPrefillResult = {
  company: HubspotCompanyProfile | null;
  prefill: ProspectPrefill | null;
  error: string | null;
};

/**
 * Everything the deep link can prefill, in one call: the Company profile, its
 * owner Contact, and the mapping of both onto the app's own shapes.
 *
 * Returns an error string instead of throwing so a bad id or missing token
 * degrades to an un-prefilled, un-linked form rather than a broken page. The
 * contact read is best-effort inside the adapter (it spans a second token and
 * can 403), so a company with no readable contact still prefills the business
 * half rather than failing the whole call.
 */
export async function getHubspotCompanyForProspectAction(companyId: string): Promise<ProspectPrefillResult> {
  const effective = await getEffectiveRole();
  if (!effective) throw new Error("Not authenticated");

  try {
    const company = await getCompanyProfile(companyId);
    if (!company) return { company: null, prefill: null, error: "HubSpot company not found" };
    const contact = await getCompanyOwnerContact(companyId);
    return { company, prefill: buildProspectPrefill(company, contact), error: null };
  } catch (err) {
    return { company: null, prefill: null, error: err instanceof Error ? err.message : "Could not reach HubSpot" };
  }
}

// Mirrors the shape linkTenantCompanyAction persists in applications.ts —
// only what's actually known from the Company read, no invented variant.
function tenantLinkFromCompany(company: TenantCompany, linkedByUserId: string): TenantLink {
  return {
    hubspotCompanyId: company.id,
    companyName: company.name,
    tenantRef: company.tenantRef,
    adyenAccountHolderId: company.adyenAccountHolderId,
    linkedAt: new Date().toISOString(),
    linkedByUserId,
  };
}

// ── Quote lines are re-derived here, never accepted from the browser ────────
// The configurator computes the same thing for its live preview, but that copy
// is display only: unit prices, the ordering-point count and the platform tier
// it implies are money, and a stale tab or an edited payload would otherwise
// persist a wrong price, a $0 platform fee, or the wrong tier ($433/mo).
// The client sends what the rep PICKED — product ids, quantities, channels —
// and everything downstream of that is computed against the live catalog.

/** What the rep picked. Prices and the derived tier are the server's business. */
export type QuotePick = { hubspotProductId: string; qty: number };

async function deriveQuoteLines(
  picks: QuotePick[],
  channels: string[]
): Promise<{ quoteLines: QuoteLine[] | null; orderPoints: OrderPoints | null }> {
  const wanted = picks.filter(p => p.hubspotProductId && p.qty > 0);
  if (!wanted.length && !channels.length) return { quoteLines: null, orderPoints: null };

  const catalog = await listQuotableProductsAction();
  if (catalog.error) throw new Error(`Couldn't price this quote: ${catalog.error}`);

  // Resolved against the PICKABLE list, so the picker's exclusions (the derived
  // platform tiers among them) are enforced server-side too.
  const lines = wanted.map(pick => {
    const product = catalog.products.find(p => p.hubspotProductId === pick.hubspotProductId);
    if (!product) {
      throw new Error(
        `Product ${pick.hubspotProductId} is no longer in the AIO catalog — reload the page and re-add it.`
      );
    }
    return toQuoteLine(product, Math.floor(pick.qty));
  });

  const breakdown = deriveOrderPoints(lines, channels);
  const tier = resolvePlatformTier(breakdown.orderPoints.total, catalog.all, lines);
  if (tier.status === "unresolved") {
    throw new Error(
      `${breakdown.orderPoints.total} ordering points require "${tier.tierName}", which isn't in the ` +
      `HubSpot catalog. Fix the catalog before sending this quote — it would go out with no platform fee.`
    );
  }

  const quoteLines = tier.line ? [tier.line, ...lines] : lines;
  return {
    quoteLines: quoteLines.length ? quoteLines : null,
    orderPoints: quoteLines.length || channels.length ? breakdown.orderPoints : null,
  };
}

export async function createProspectAction(input: {
  merchantName: string;
  contactEmail: string;
  targetMargin: number;
  pricingModel: PricingModel;
  // Dual statement path. Either (or both) may be supplied: the rep can enter
  // ticket/volume configs, upload the statement themselves (analysis already
  // run through /api/analyze), or neither — in which case the customer is
  // asked for a statement on the lead page as before. When both exist the
  // analysis wins for pricing; quoteConfig stays as what the rep quoted on.
  quoteConfig?: QuoteConfig | null;
  analysis?: StatementAnalysis | null;
  // Phase C — what the rep picked in the configurator. Prices, the
  // ordering-point count and the platform tier are derived server-side from
  // these (see deriveQuoteLines); the client's own copy is preview only.
  picks?: QuotePick[] | null;
  channels?: string[] | null;
  // Phase F — set when the rep arrived via the HubSpot Company deep link, so
  // the linkage is stamped from day one instead of attached manually/late.
  // Re-fetched here (not trusted from whatever the client last showed) so the
  // persisted snapshot reflects the Company at creation time.
  hubspotCompanyId?: string | null;
}): Promise<{ app: MerchantApplication; linkUrl: string; warning: string | null }> {
  const effective = await getEffectiveRole();
  if (!effective) throw new Error("Not authenticated");

  const token = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LINK_TTL_DAYS * 24 * 60 * 60 * 1000);

  let tenantLink: TenantLink | null = null;
  // The same HubSpot read also prefills business/owner details onto the new
  // application, so whatever the CRM already knows reaches the customer's
  // onboarding form instead of being asked for again. Derived here rather than
  // accepted from the browser, for the same reason quote lines are.
  let prefill: ProspectPrefill | null = null;
  // Surfaced on the success screen: the rep is told the prospect was created,
  // so they also have to be told the linkage they asked for wasn't.
  let warning: string | null = null;
  if (input.hubspotCompanyId) {
    try {
      const company = await getCompanyProfile(input.hubspotCompanyId);
      if (company) {
        tenantLink = tenantLinkFromCompany(company, effective.userId);
        prefill = buildProspectPrefill(company, await getCompanyOwnerContact(input.hubspotCompanyId));
      } else warning = `HubSpot company ${input.hubspotCompanyId} wasn't found, so the prospect isn't linked — attach it manually.`;
    } catch (err) {
      // HubSpot unreachable at submit time — create the prospect unlinked
      // rather than blocking prospect creation on a read-only enrichment call,
      // but never silently: an unlinked application breaks the Phase F chain.
      console.error("createProspectAction: HubSpot company link failed", input.hubspotCompanyId, err);
      warning = "Prospect created, but the HubSpot company link could not be stamped — attach it manually.";
    }
  }

  const quoteConfig =
    input.quoteConfig && input.quoteConfig.monthlyVolume > 0 && input.quoteConfig.avgTicket > 0
      ? input.quoteConfig
      : null;
  const analysis = input.analysis ?? null;
  // The same predicate the customer-facing render uses, so a quote can't be
  // marked "sent" when it would draw as nothing.
  const hasQuote = hasQuoteBasis({ analysis, quoteConfig, targetMargin: null, pricingModel: null });

  const { quoteLines, orderPoints } = await deriveQuoteLines(input.picks ?? [], input.channels ?? []);

  // Only materialize a ProcessingInfo when HubSpot actually gave us something —
  // an all-blank record would read as "the rep answered these" downstream.
  const prefilledProcessing: ProcessingInfo | null =
    prefill && Object.keys(prefill.processing).length
      ? {
          monthlyVolume: "", avgTicket: "", cardPresentPct: "", mcc: "",
          businessDescription: "", previouslyTerminated: "no", bankruptcy: "no", currentProcessor: "",
          ...prefill.processing,
        }
      : null;

  const app: MerchantApplication = {
    id: `prospect_${now.getTime()}`,
    ownerUserId: effective.userId,
    customerUserId: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    // The link goes out with a quote already on it when the rep supplied a
    // basis; otherwise it's still the "upload your statement" link.
    stage: hasQuote ? "quote_sent" : "lead_link_sent",
    hubspotDealId: null,
    tenantLink,
    adyenIds: null,
    adyenOnboardingUrl: null,
    checkIds: null,
    hubspotIds: null,
    quoteConfig,
    // Kept even when there's no rate basis yet: the lines are what the rep
    // configured, and the customer sees them once a quote exists (their own
    // statement upload can supply the rate half later).
    quoteLines,
    orderPoints,
    quoteAcceptedAt: null,
    targetMargin: input.targetMargin,
    pricingModel: input.pricingModel,
    customerLinkToken: token,
    customerLinkPurpose: "lead_upload",
    customerLinkSentAt: now.toISOString(),
    customerLinkExpiresAt: expiresAt.toISOString(),
    analysis,
    proposal: null,
    // HubSpot fills the blanks; what the rep actually typed always wins.
    business: {
      bizType: "llc",
      address: "", city: "", state: "", zip: "", phone: "", website: "",
      yearsInBusiness: "", annualRevenue: "",
      ...prefill?.business,
      legalName: input.merchantName, dba: input.merchantName,
    },
    ownerContact: {
      firstName: "", lastName: "", title: "", phone: "",
      ...prefill?.ownerContact,
      email: input.contactEmail || prefill?.ownerContact.email || "",
    },
    processing: prefilledProcessing,
    agreement: null,
  };

  await postgresStorage.saveApplication({ userId: effective.userId, role: effective.role }, app);

  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  return { app, linkUrl: `${base}/lead/${token}`, warning };
}
