import { describe, it, expect } from "vitest";
import {
  customerOnboardInitial,
  flattenSections,
  isFromHubspot,
  mergeProspectPrefill,
  prefillCarryoverLabels,
  NO_PREFILL_APPLIED,
  type AppliedProspectPrefill,
} from "@/lib/prefillMerge";
import type { ProspectPrefill } from "@/lib/hubspotPrefill";
import type { MerchantApplication, StatementAnalysis } from "@/types/merchant";

function prefill(over: Partial<ProspectPrefill> = {}): ProspectPrefill {
  return {
    business: {}, ownerContact: {}, processing: {}, channels: [], fromHubspot: [],
    ...over,
  };
}

const ACME = prefill({
  business: { legalName: "Acme Pizza", dba: "Acme Pizza", city: "Anaheim" },
  ownerContact: { email: "owner@acme.com" },
  channels: ["website", "qr"],
  fromHubspot: ["business.legalName", "business.dba", "business.city", "ownerContact.email", "channels"],
});

const BETA = prefill({
  business: { legalName: "Beta Tacos", dba: "Beta Tacos" },
  ownerContact: { email: "hi@beta.com" },
  channels: ["third_party_delivery"],
  fromHubspot: ["business.legalName", "business.dba", "ownerContact.email", "channels"],
});

const BLANK_FORM = { merchantName: "", contactEmail: "", channels: [] as string[] };

// ── Rep side: prefill vs. what the rep typed ────────────────────────────────

describe("mergeProspectPrefill", () => {
  it("fills a blank form from the prefill", () => {
    const r = mergeProspectPrefill(BLANK_FORM, NO_PREFILL_APPLIED, ACME);
    expect(r.merchantName).toBe("Acme Pizza");
    expect(r.contactEmail).toBe("owner@acme.com");
    expect(r.channels).toEqual(["website", "qr"]);
    expect(r.applied).toEqual({ merchantName: "Acme Pizza", contactEmail: "owner@acme.com", channels: ["website", "qr"] });
  });

  it("falls back to dba when HubSpot had no legal name", () => {
    const r = mergeProspectPrefill(BLANK_FORM, NO_PREFILL_APPLIED, prefill({ business: { dba: "Corner Cafe" } }));
    expect(r.merchantName).toBe("Corner Cafe");
  });

  it("never overwrites what the rep typed", () => {
    const typed = { merchantName: "Acme Pizza LLC", contactEmail: "gm@acme.com", channels: [] as string[] };
    const r = mergeProspectPrefill(typed, NO_PREFILL_APPLIED, ACME);
    expect(r.merchantName).toBe("Acme Pizza LLC");
    expect(r.contactEmail).toBe("gm@acme.com");
    // Rep-owned now, so no "from HubSpot" hint and nothing for a later switch to replace.
    expect(r.applied.merchantName).toBeUndefined();
    expect(r.applied.contactEmail).toBeUndefined();
  });

  it("treats a whitespace-only field as blank, not as rep input", () => {
    const r = mergeProspectPrefill({ ...BLANK_FORM, merchantName: "   " }, NO_PREFILL_APPLIED, ACME);
    expect(r.merchantName).toBe("Acme Pizza");
  });

  it("replaces the previous company's values on a switch rather than merging", () => {
    const first = mergeProspectPrefill(BLANK_FORM, NO_PREFILL_APPLIED, ACME);
    const second = mergeProspectPrefill(first, first.applied, BETA);
    expect(second.merchantName).toBe("Beta Tacos");
    expect(second.contactEmail).toBe("hi@beta.com");
    expect(second.channels).toEqual(["third_party_delivery"]);
  });

  it("keeps rep edits across a company switch", () => {
    const first = mergeProspectPrefill(BLANK_FORM, NO_PREFILL_APPLIED, ACME);
    const edited = { ...first, contactEmail: "gm@acme.com" };
    const second = mergeProspectPrefill(edited, first.applied, BETA);
    expect(second.merchantName).toBe("Beta Tacos"); // untouched → follows HubSpot
    expect(second.contactEmail).toBe("gm@acme.com"); // typed → the rep's
  });

  it("keeps rep-ticked channels and replaces only the seeded ones", () => {
    const first = mergeProspectPrefill(BLANK_FORM, NO_PREFILL_APPLIED, ACME);
    const edited = { ...first, channels: [...first.channels, "phone_ai"] };
    const second = mergeProspectPrefill(edited, first.applied, BETA);
    expect(second.channels).toEqual(["phone_ai", "third_party_delivery"]);
  });

  it("hands a channel to the rep when they ticked it themselves, so a later switch can't take it", () => {
    const repTicked = { ...BLANK_FORM, channels: ["website"] };
    const first = mergeProspectPrefill(repTicked, NO_PREFILL_APPLIED, ACME);
    expect(first.channels).toEqual(["website", "qr"]);
    expect(first.applied.channels).toEqual(["qr"]);
    const second = mergeProspectPrefill(first, first.applied, BETA);
    expect(second.channels).toEqual(["website", "third_party_delivery"]);
  });

  it("withdraws what HubSpot filled when the company is cleared", () => {
    const first = mergeProspectPrefill(BLANK_FORM, NO_PREFILL_APPLIED, ACME);
    const edited = { ...first, contactEmail: "gm@acme.com" };
    const cleared = mergeProspectPrefill(edited, first.applied, null);
    expect(cleared.merchantName).toBe("");
    expect(cleared.contactEmail).toBe("gm@acme.com");
    expect(cleared.channels).toEqual([]);
    expect(cleared.applied).toEqual({ merchantName: undefined, contactEmail: undefined, channels: [] });
  });

  it("leaves a field alone when HubSpot has nothing for it", () => {
    const r = mergeProspectPrefill(BLANK_FORM, NO_PREFILL_APPLIED, prefill({ business: { city: "Anaheim" } }));
    expect(r.merchantName).toBe("");
    expect(r.applied.merchantName).toBeUndefined();
  });
});

describe("isFromHubspot", () => {
  const applied: AppliedProspectPrefill = { merchantName: "Acme Pizza", channels: [] };

  it("marks a field still showing the prefilled value", () => {
    expect(isFromHubspot(applied, "merchantName", "Acme Pizza")).toBe(true);
  });

  it("stops marking it once the value differs", () => {
    expect(isFromHubspot(applied, "merchantName", "Acme Pizza LLC")).toBe(false);
  });

  it("never marks a field HubSpot didn't fill", () => {
    expect(isFromHubspot(applied, "contactEmail", "")).toBe(false);
  });
});

describe("prefillCarryoverLabels", () => {
  it("names only what isn't a visible field on the prospect form", () => {
    expect(prefillCarryoverLabels(ACME.fromHubspot)).toEqual(["city"]);
  });

  it("collapses first and last name into one label", () => {
    expect(prefillCarryoverLabels(["ownerContact.firstName", "ownerContact.lastName"])).toEqual(["owner name"]);
  });

  it("drops paths it has no label for rather than guessing", () => {
    expect(prefillCarryoverLabels(["business.somethingNew"])).toEqual([]);
  });

  it("is empty when nothing came from HubSpot", () => {
    expect(prefillCarryoverLabels([])).toEqual([]);
  });
});

// ── Customer side: the onboarding form ──────────────────────────────────────

const ANALYSIS: StatementAnalysis = {
  merchantName: "Little Arabia", processingMonth: "2026-06", totalVolume: 124_500,
  totalTransactions: 3_100, totalFees: 3_800, interchangeFees: 2_400, processorFees: 1_100,
  otherFees: 300, effectiveRate: 0.0305, interchangeRate: 0.0193, processorMarkup: 0.0088,
  statedMarkupRate: 0, statedPerTxnFee: 0, interchangeNotShown: false, averageTicket: 40.16,
  cardPresentVolume: 100_000, cardNotPresentVolume: 24_500, cardPresentPct: 0.803,
  cardNotPresentPct: 0.197, visaVolume: 0, mastercardVolume: 0, amexVolume: 0, discoverVolume: 0,
  rewardCardPct: 0, corporateCardPct: 0, currentPricingModel: "2-tier",
  currentProcessorName: "Clover", annualVolume: 1_494_000, confidence: "high", notes: "",
  currentMargin: 0.0088,
};

type OnboardSource = Pick<MerchantApplication, "analysis" | "business" | "ownerContact" | "processing">;

const NO_SOURCE: OnboardSource = { analysis: null, business: null, ownerContact: null, processing: null };

describe("customerOnboardInitial", () => {
  it("marks nothing as pre-filled when there's nothing on file", () => {
    const r = customerOnboardInitial(NO_SOURCE);
    expect(r.prefilled).toEqual([]);
    expect(r.business.legalName).toBe("");
    expect(r.business.bizType).toBe("llc");
    expect(r.ownerContact.title).toBe("Owner");
    expect(r.processing.previouslyTerminated).toBe("no");
  });

  it("treats persisted empty strings as not pre-filled", () => {
    // Exactly what createProspectAction writes when HubSpot knew nothing.
    const r = customerOnboardInitial({
      ...NO_SOURCE,
      business: {
        legalName: "Acme Pizza", dba: "Acme Pizza", bizType: "llc",
        address: "", city: "", state: "", zip: "", phone: "", website: "",
        yearsInBusiness: "", annualRevenue: "",
      },
    });
    expect(r.prefilled).toEqual(["business.legalName", "business.dba"]);
    expect(r.business.city).toBe("");
  });

  it("ignores whitespace-only persisted values", () => {
    const r = customerOnboardInitial({
      ...NO_SOURCE,
      ownerContact: { firstName: "  ", lastName: "Nasser", title: "", email: "", phone: "" },
    });
    expect(r.prefilled).toEqual(["ownerContact.lastName"]);
    expect(r.ownerContact.firstName).toBe("");
    // A blank persisted value must not wipe the form's own default.
    expect(r.ownerContact.title).toBe("Owner");
  });

  it("does not mark a form default as pre-filled", () => {
    const r = customerOnboardInitial({
      ...NO_SOURCE,
      business: {
        legalName: "", dba: "", bizType: "llc", address: "", city: "", state: "", zip: "",
        phone: "", website: "", yearsInBusiness: "", annualRevenue: "",
      },
      ownerContact: { firstName: "", lastName: "", title: "Owner", email: "", phone: "" },
    });
    expect(r.prefilled).toEqual([]);
  });

  it("does mark a default-valued field once it holds something else", () => {
    const r = customerOnboardInitial({
      ...NO_SOURCE,
      business: {
        legalName: "", dba: "", bizType: "corp", address: "", city: "", state: "", zip: "",
        phone: "", website: "", yearsInBusiness: "", annualRevenue: "",
      },
    });
    expect(r.prefilled).toEqual(["business.bizType"]);
  });

  it("seeds processing from the statement analysis and marks it pre-filled", () => {
    const r = customerOnboardInitial({ ...NO_SOURCE, analysis: ANALYSIS });
    expect(r.business.legalName).toBe("Little Arabia");
    expect(r.processing.monthlyVolume).toBe("124500");
    expect(r.processing.avgTicket).toBe("40");
    expect(r.processing.cardPresentPct).toBe("80");
    expect(r.processing.currentProcessor).toBe("Clover");
    expect(r.prefilled).toContain("processing.monthlyVolume");
    expect(r.prefilled).toContain("business.dba");
    expect(r.prefilled).not.toContain("processing.mcc");
  });

  it("lets a persisted value win over the analysis-derived one", () => {
    const r = customerOnboardInitial({
      ...NO_SOURCE,
      analysis: ANALYSIS,
      processing: {
        monthlyVolume: "90000", avgTicket: "", cardPresentPct: "", mcc: "5812",
        businessDescription: "", previouslyTerminated: "no", bankruptcy: "no", currentProcessor: "",
      },
    });
    expect(r.processing.monthlyVolume).toBe("90000");
    expect(r.processing.avgTicket).toBe("40");        // blank persisted → analysis survives
    expect(r.processing.currentProcessor).toBe("Clover");
    expect(r.processing.mcc).toBe("5812");
  });

  it("never carries an agreement forward — consent is given on the visit", () => {
    const r = customerOnboardInitial(NO_SOURCE) as Record<string, unknown>;
    expect(r.agreement).toBeUndefined();
    expect(customerOnboardInitial(NO_SOURCE).prefilled.some(p => p.startsWith("agreement."))).toBe(false);
  });
});

describe("flattenSections", () => {
  it("keys every field by its dotted path", () => {
    const initial = customerOnboardInitial({ ...NO_SOURCE, analysis: ANALYSIS });
    const flat = flattenSections(initial);
    expect(flat["business.legalName"]).toBe("Little Arabia");
    expect(flat["ownerContact.title"]).toBe("Owner");
    expect(flat["processing.currentProcessor"]).toBe("Clover");
    // The `prefilled` list must not leak into the flattened values.
    expect(Object.keys(flat).some(k => k.startsWith("prefilled"))).toBe(false);
  });
});
