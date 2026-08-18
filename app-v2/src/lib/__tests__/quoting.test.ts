import { describe, it, expect } from "vitest";
import {
  ORDER_POINT_RULES,
  PICKER_EXCLUDED_PRODUCT_NAMES,
  PLATFORM_TIER_PRODUCT_NAMES,
  UNCATEGORIZED_GROUP,
  deriveOrderPoints,
  groupProducts,
  isPickable,
  platformTierNameFor,
  quoteTotals,
  resolvePlatformTier,
  toQuoteLine,
} from "@/lib/quoting";
import type { CatalogProduct, QuoteLine } from "@/types/merchant";

// Fixture catalog mirroring the live HubSpot records (names and prices as they
// actually are, post-trim). No network anywhere in this file.
const p = (
  hubspotProductId: string,
  name: string,
  price: number,
  billingFrequency: CatalogProduct["billingFrequency"],
  productType: string,
): CatalogProduct => ({ hubspotProductId, name, price, billingFrequency, productType });

const CATALOG: CatalogProduct[] = [
  p("217526517443", PLATFORM_TIER_PRODUCT_NAMES.small, 99, "weekly", "Software"),
  p("292286544587", PLATFORM_TIER_PRODUCT_NAMES.large, 199, "weekly", "Software"),
  p("247900575472", "AIO Platform - Food Truck", 75, "weekly", "Software"),
  p("223152695997", "AIO Marketing Platform", 49, "weekly", "Software"),
  p("303779019494", "AIO - Automated Review Manager", 39, "monthly", "Software"),
  p("217445755632", "POS Unit", 749, "one_time", "inventory"),
  p("223452690130", "POS Unit - With Customer Facing Display", 949, "one_time", "inventory"),
  p("260674226888", "Mega Kiosk", 2459, "one_time", "inventory"),
  p("222497165009", "Kiosk + Payment Terminal (AMS1) and Mount", 999, "one_time", "inventory"),
  p("223511653101", "mPOS", 349, "one_time", "inventory"),
  p("223511653105", "Payment Terminal - AMS1", 99, "one_time", "inventory"),
  p("222497165011", "Cash Drawer", 69, "one_time", "inventory"),
  p("276751313619", "Orders Hub Tablet", 199, "one_time", "inventory"),
  p("223452690133", "Onsite Installation", 999, "one_time", "Service"),
  p("318731436770", "CAMP Invoice", 300, "one_time", ""),
  p("281354281678", "AIO Pre Auth", 0.5, "one_time", "Service"),
  p("260559288040", "AIO Processing Two Tiered Rate", 0, "one_time", "AIO Payment Processing"),
  p("316076031729", "Small TV (32in to 43in)", 299, "one_time", ""),
];

const find = (name: string) => CATALOG.find(c => c.name === name)!;
const line = (name: string, qty: number) => toQuoteLine(find(name), qty);

describe("picker exclusions", () => {
  it("hides the placeholders, CAMP Invoice, the per-transaction pre-auth, and both platform tiers", () => {
    const hidden = CATALOG.filter(c => !isPickable(c)).map(c => c.name).sort();
    expect(hidden).toEqual([
      "AIO Platform (1 to 5 Order Points)",
      "AIO Platform (6 + Order Points)",
      "AIO Pre Auth",
      "AIO Processing Two Tiered Rate",
      "CAMP Invoice",
    ]);
  });

  it("keeps everything else quotable, including the food-truck platform", () => {
    expect(isPickable(find("AIO Platform - Food Truck"))).toBe(true);
    expect(isPickable(find("POS Unit"))).toBe(true);
    expect(isPickable(find("Onsite Installation"))).toBe(true);
  });

  it("names the exclusions rather than inlining them", () => {
    expect([...PICKER_EXCLUDED_PRODUCT_NAMES]).toContain("CAMP Invoice");
  });
});

describe("groupProducts", () => {
  const groups = groupProducts(CATALOG.filter(isPickable));

  it("orders hardware, software, service, then the untyped bucket", () => {
    expect(groups.map(g => g.label)).toEqual(["Hardware", "Software", "Service", UNCATEGORIZED_GROUP]);
  });

  it("never silently hides an untyped product", () => {
    const uncategorized = groups.find(g => g.type === UNCATEGORIZED_GROUP)!;
    expect(uncategorized.products.map(x => x.name)).toContain("Small TV (32in to 43in)");
  });
});

describe("quoteTotals — frequency-aware, never merged", () => {
  it("keeps a weekly platform fee and a one-time POS unit as separate numbers", () => {
    // E2E-PLAN.md's Phase C verify case.
    const lines = [line(PLATFORM_TIER_PRODUCT_NAMES.small, 1), line("POS Unit", 1)];
    const t = quoteTotals(lines);

    expect(t.oneTime).toBe(749);
    expect(t.recurring).toEqual([{ frequency: "weekly", amount: 99 }]);
    // The 4.33x trap: 99 x 52/12, not 99 (rendering a weekly price as monthly)
    // and not 99 x 4. HubSpot's own hs_mrr shows $428.67 because it rounds the
    // factor to 4.33; the exact 52/12 normalization is $429.00, so assert the
    // magnitude rather than pretending the two agree to the cent.
    expect(t.monthlyEquivalent).toBeCloseTo(99 * (52 / 12), 10);
    expect(t.monthlyEquivalent).toBeGreaterThan(428);
    expect(t.monthlyEquivalent).toBeLessThan(430);
    expect(Math.abs(t.monthlyEquivalent - 428.67)).toBeLessThan(0.5);

    // Nothing anywhere in the result equals the naive cross-frequency sum.
    const naive = 749 + 99;
    expect(t.oneTime).not.toBe(naive);
    expect(t.monthlyEquivalent).not.toBe(naive);
    expect(t.recurring.some(r => r.amount === naive)).toBe(false);
  });

  it("groups recurring lines by cycle instead of adding weekly to monthly", () => {
    const lines = [
      line(PLATFORM_TIER_PRODUCT_NAMES.small, 1),   // $99/wk
      line("AIO Marketing Platform", 1),            // $49/wk
      line("AIO - Automated Review Manager", 1),    // $39/mo
    ];
    const t = quoteTotals(lines);

    expect(t.recurring).toEqual([
      { frequency: "weekly", amount: 148 },
      { frequency: "monthly", amount: 39 },
    ]);
    // 148 x 52/12 + 39 — the only legitimate way to combine the two cycles.
    expect(t.monthlyEquivalent).toBeCloseTo(148 * (52 / 12) + 39, 10);
    expect(t.recurring.some(r => r.amount === 187)).toBe(false);
  });

  it("multiplies by quantity and leaves one-time charges out of the monthly figure", () => {
    const t = quoteTotals([line("POS Unit", 3)]);
    expect(t.oneTime).toBe(2247);
    expect(t.monthlyEquivalent).toBe(0);
    expect(t.recurring).toEqual([]);
  });
});

describe("snapshot immutability", () => {
  it("keeps the quoted price when the catalog price later changes", () => {
    const catalogNow = [p("217526517443", PLATFORM_TIER_PRODUCT_NAMES.small, 99, "weekly", "Software")];
    const quoted = toQuoteLine(catalogNow[0], 1);

    // HubSpot raises the platform fee after the quote went out.
    catalogNow[0] = { ...catalogNow[0], price: 129, billingFrequency: "monthly" };

    expect(quoted.unitPrice).toBe(99);
    expect(quoted.billingFrequency).toBe("weekly");
    expect(quoteTotals([quoted]).recurring).toEqual([{ frequency: "weekly", amount: 99 }]);
  });
});

describe("deriveOrderPoints", () => {
  it("counts 3 POS + 2 kiosks + a website as 6 and flips to the 6+ tier", () => {
    // The plan's own verify case.
    const lines = [line("POS Unit", 3), line("Mega Kiosk", 2)];
    const { orderPoints } = deriveOrderPoints(lines, ["website"]);

    expect(orderPoints.hardware).toEqual({ "POS Unit": 3, "Mega Kiosk": 2 });
    expect(orderPoints.channels).toEqual(["website"]);
    expect(orderPoints.total).toBe(6);
    expect(platformTierNameFor(6)).toBe(PLATFORM_TIER_PRODUCT_NAMES.large);

    const tier = resolvePlatformTier(orderPoints.total, CATALOG, lines);
    expect(tier.status).toBe("resolved");
    expect(tier.line!.name).toBe(PLATFORM_TIER_PRODUCT_NAMES.large);
    expect(tier.line!.unitPrice).toBe(199);
    expect(tier.line!.billingFrequency).toBe("weekly");
  });

  it("stays on the 1-5 tier at exactly 5", () => {
    const lines = [line("POS Unit", 3), line("mPOS", 1)];
    const { orderPoints } = deriveOrderPoints(lines, ["website"]);
    expect(orderPoints.total).toBe(5);
    expect(platformTierNameFor(5)).toBe(PLATFORM_TIER_PRODUCT_NAMES.small);
    expect(resolvePlatformTier(5, CATALOG, lines).line!.unitPrice).toBe(99);
  });

  it("counts a point-bearing product even when HubSpot lost its product type", () => {
    // The type gate used to skip anything not typed `inventory`, so an untyped
    // or re-typed kiosk silently contributed 0 AND never showed up as
    // unclassified — 6 real points billed as 5.
    const untypedKiosk: QuoteLine = {
      ...line("Mega Kiosk", 2), productType: "",
    };
    const { orderPoints, unclassified } = deriveOrderPoints([untypedKiosk, line("POS Unit", 4)], []);

    expect(orderPoints.hardware["Mega Kiosk"]).toBe(2);
    expect(orderPoints.total).toBe(6);
    expect(platformTierNameFor(orderPoints.total)).toBe(PLATFORM_TIER_PRODUCT_NAMES.large);
    expect(unclassified).toEqual([]);
  });

  it("matches the rule on product id, so a HubSpot rename can't drop the points", () => {
    const renamed: QuoteLine = { ...line("Mega Kiosk", 1), name: "Mega Kiosk (2026 Edition)" };
    const { orderPoints, unclassified } = deriveOrderPoints([renamed], []);

    expect(orderPoints.total).toBe(1);
    expect(orderPoints.hardware["Mega Kiosk (2026 Edition)"]).toBe(1);
    expect(unclassified).toEqual([]);
  });

  it("counts a kiosk once, not once per lane", () => {
    expect(ORDER_POINT_RULES["Mega Kiosk"].pointsPerUnit).toBe(1);
    expect(deriveOrderPoints([line("Mega Kiosk", 1)], []).orderPoints.total).toBe(1);
  });

  it("counts each declared channel once and only the known ones", () => {
    const { orderPoints } = deriveOrderPoints([], ["website", "qr", "not_a_channel"]);
    expect(orderPoints.channels).toEqual(["website", "qr"]);
    expect(orderPoints.total).toBe(2);
  });

  it("excludes payment terminals, cash drawers and other non-ordering hardware", () => {
    const lines = [line("Payment Terminal - AMS1", 4), line("Cash Drawer", 2), line("Small TV (32in to 43in)", 1)];
    const { orderPoints, unclassified } = deriveOrderPoints(lines, []);
    expect(orderPoints.total).toBe(0);
    // All three are known rules at 0 points, so none of them is a mystery —
    // including the TV, which carries no hs_product_type live.
    expect(unclassified).toEqual([]);
  });

  it("flags a tablet as needs-review — never silently counted, never silently dropped", () => {
    const lines = [line("POS Unit", 2), line("Orders Hub Tablet", 4)];
    const { orderPoints, needsReview } = deriveOrderPoints(lines, []);

    expect(orderPoints.total).toBe(2);                     // not counted
    expect(orderPoints.hardware["Orders Hub Tablet"]).toBeUndefined();
    expect(needsReview).toHaveLength(1);                   // but not invisible
    expect(needsReview[0]).toMatchObject({ name: "Orders Hub Tablet", qty: 4 });
    expect(needsReview[0].reason).toMatch(/POS replacement/i);
  });

  it("surfaces unrecognised hardware as unclassified at zero points", () => {
    const unknown: QuoteLine = {
      hubspotProductId: "999", name: "Some New Ordering Gadget", qty: 2,
      unitPrice: 500, billingFrequency: "one_time", productType: "inventory",
    };
    const { orderPoints, unclassified } = deriveOrderPoints([unknown], []);
    expect(orderPoints.total).toBe(0);
    expect(unclassified).toEqual([{ name: "Some New Ordering Gadget", qty: 2 }]);
  });

  it("does not treat software or services as unclassified hardware", () => {
    const { unclassified } = deriveOrderPoints(
      [line("Onsite Installation", 1), line("AIO Marketing Platform", 1)], []
    );
    expect(unclassified).toEqual([]);
  });
});

describe("platform tier selection", () => {
  it("selects nothing at zero order points", () => {
    expect(platformTierNameFor(0)).toBeNull();
    expect(resolvePlatformTier(0, CATALOG, [])).toEqual({ status: "none_needed", line: null, tierName: null });
  });

  it("suppresses the tier line when a flat-priced food-truck platform is quoted", () => {
    const lines = [line("AIO Platform - Food Truck", 1), line("POS Unit", 1)];
    expect(resolvePlatformTier(1, CATALOG, lines)).toEqual({ status: "food_truck", line: null, tierName: null });
  });

  it("finds the tier by product id, so a HubSpot rename can't drop the platform fee", () => {
    const renamed = CATALOG.map(c =>
      c.name === PLATFORM_TIER_PRODUCT_NAMES.large ? { ...c, name: "AIO Platform (6+ Ordering Points)" } : c
    );
    const tier = resolvePlatformTier(6, renamed, []);
    expect(tier.status).toBe("resolved");
    expect(tier.line!.unitPrice).toBe(199);
  });

  it("is LOUD, not null, when a tier is owed but the catalog can't supply it", () => {
    // Silently omitting this line is a $433/mo hole in the quote, so the caller
    // has to be forced to deal with it rather than reading it as "no fee due".
    const tier = resolvePlatformTier(3, [], []);
    expect(tier.status).toBe("unresolved");
    expect(tier.line).toBeNull();
    expect(tier.tierName).toBe(PLATFORM_TIER_PRODUCT_NAMES.small);
  });
});
