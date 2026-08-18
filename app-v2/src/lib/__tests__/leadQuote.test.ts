import { describe, it, expect } from "vitest";
import {
  CONFIG_QUOTE_ASSUMPTIONS,
  INTERCHANGE_ESTIMATE,
  analysisFromQuoteConfig,
} from "@/lib/pricing";
import { buildCustomerSafeQuote, hasQuoteBasis } from "@/lib/leadQuote";
import type { StatementAnalysis } from "@/types/merchant";

// A statement-less quote is pure arithmetic on two rep-entered numbers, so the
// expectations below are hand-computed from Steve's constants rather than
// snapshotted off the implementation.
const CONFIG = { avgTicket: 40, monthlyVolume: 100_000 };
const { cardPresentPct: CP, cardNotPresentPct: CNP } = CONFIG_QUOTE_ASSUMPTIONS;

describe("analysisFromQuoteConfig", () => {
  it("derives transaction count from volume ÷ ticket", () => {
    expect(analysisFromQuoteConfig(CONFIG).totalTransactions).toBe(2500);
    expect(analysisFromQuoteConfig({ avgTicket: 37.5, monthlyVolume: 10_000 }).totalTransactions).toBe(267);
  });

  it("survives a zero ticket without dividing by zero", () => {
    const a = analysisFromQuoteConfig({ avgTicket: 0, monthlyVolume: 50_000 });
    expect(a.totalTransactions).toBe(0);
    expect(a.totalVolume).toBe(50_000);
  });

  it("splits volume on the 90/10 default and blends interchange from it", () => {
    const a = analysisFromQuoteConfig(CONFIG);
    expect(CP).toBe(0.9);
    expect(CNP).toBe(0.1);
    expect(a.cardPresentVolume).toBe(90_000);
    expect(a.cardNotPresentVolume).toBe(10_000);
    // 0.9 × 2.10% + 0.1 × 2.50% = 2.14%
    expect(a.interchangeRate).toBeCloseTo(0.0214, 10);
    expect(a.interchangeFees).toBeCloseTo(2140, 6);
  });

  it("marks interchange as estimated so derivePricing uses the per-lane estimate", () => {
    const a = analysisFromQuoteConfig(CONFIG);
    expect(a.icEstimated).toBe(true);
    expect(a.interchangeNotShown).toBe(true);
    expect(a.confidence).toBe("low");
  });

  it("claims nothing about what the merchant pays today", () => {
    const a = analysisFromQuoteConfig(CONFIG);
    expect(a.totalFees).toBe(0);
    expect(a.effectiveRate).toBe(0);
    expect(a.processorMarkup).toBe(0);
    expect(a.currentMargin).toBe(0);
    expect(a.currentProcessorName).toBe("");
  });
});

describe("buildCustomerSafeQuote — config basis", () => {
  const quote = buildCustomerSafeQuote({
    analysis: null,
    quoteConfig: CONFIG,
    targetMargin: 0.008,
    pricingModel: "2-tier",
  })!;

  it("prices each lane at its own interchange estimate plus the target margin", () => {
    // 2-tier charges fees on top of the rate (Steve 2026-07-23), and a customer
    // quote carries no per-txn or monthly fee, so:
    //   CP  90,000 × (2.10% + 0.80%) = $2,610
    //   CNP 10,000 × (2.50% + 0.80%) =   $330
    const expectedMonthly =
      90_000 * (INTERCHANGE_ESTIMATE.cardPresent + 0.008) +
      10_000 * (INTERCHANGE_ESTIMATE.cardNotPresent + 0.008);
    expect(expectedMonthly).toBeCloseTo(2940, 6);
    expect(quote.projectedMonthlyCost).toBeCloseTo(2940, 6);
    expect(quote.projectedAnnualCost).toBeCloseTo(35_280, 6);
    expect(quote.effectiveRate).toBeCloseTo(0.0294, 10);
  });

  it("echoes the rep-entered basis back", () => {
    expect(quote.basis).toBe("config");
    expect(quote.monthlyVolume).toBe(100_000);
    expect(quote.averageTicket).toBe(40);
  });

  it("leaves every savings field null — there is no statement to compare against", () => {
    expect(quote.currentMonthlyCost).toBeNull();
    expect(quote.currentEffectiveRate).toBeNull();
    expect(quote.monthlySavings).toBeNull();
    expect(quote.annualSavings).toBeNull();
    expect(quote.savingsPct).toBeNull();
  });

  it("falls back to the volume tier's desired margin when the rep set none", () => {
    // $100k lands in the maxVol 100,000 tier: desiredMargin 0.0038.
    const defaulted = buildCustomerSafeQuote({
      analysis: null, quoteConfig: CONFIG, targetMargin: null, pricingModel: "2-tier",
    })!;
    const expectedMonthly =
      90_000 * (INTERCHANGE_ESTIMATE.cardPresent + 0.0038) +
      10_000 * (INTERCHANGE_ESTIMATE.cardNotPresent + 0.0038);
    expect(defaulted.projectedMonthlyCost).toBeCloseTo(expectedMonthly, 6);
    expect(defaulted.projectedMonthlyCost).toBeLessThan(quote.projectedMonthlyCost);
  });

  it("exposes no cost, margin, floor or interchange field to the customer", () => {
    // The customer-safe boundary is the shape itself: anything internal would
    // have to appear as a key here to leak.
    expect(Object.keys(quote).sort()).toEqual([
      "annualSavings", "averageTicket", "basis", "currentEffectiveRate", "currentMonthlyCost",
      "effectiveRate", "lineTotals", "lines", "monthlySavings", "monthlyVolume", "orderPoints",
      "projectedAnnualCost", "projectedMonthlyCost", "savingsPct",
    ]);
    const serialized = JSON.stringify(quote);
    for (const forbidden of ["margin", "Margin", "floor", "Floor", "adyen", "Adyen", "cost", "bps", "interchange", "aioRevenue"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("carries no quote lines or order points when none were configured", () => {
    expect(quote.lines).toEqual([]);
    expect(quote.lineTotals).toBeNull();
    expect(quote.orderPoints).toBeNull();
  });
});

describe("buildCustomerSafeQuote — quote lines and order points", () => {
  const LINES = [
    {
      hubspotProductId: "217526517443", name: "AIO Platform (1 to 5 Order Points)", qty: 1,
      unitPrice: 99, billingFrequency: "weekly", productType: "Software",
    },
    {
      hubspotProductId: "217445755632", name: "POS Unit", qty: 2,
      unitPrice: 749, billingFrequency: "one_time", productType: "inventory",
    },
  ] as const;

  const quote = buildCustomerSafeQuote({
    analysis: null,
    quoteConfig: CONFIG,
    targetMargin: 0.008,
    pricingModel: "2-tier",
    quoteLines: [...LINES],
    orderPoints: { hardware: { "POS Unit": 2 }, channels: ["website"], total: 3 },
  })!;

  it("passes the lines through exactly as snapshotted", () => {
    expect(quote.lines).toEqual([...LINES]);
  });

  it("totals them by cycle without ever merging one-time and weekly", () => {
    expect(quote.lineTotals).toEqual({
      oneTime: 1498,
      recurring: [{ frequency: "weekly", amount: 99 }],
      monthlyEquivalent: 99 * (52 / 12),
    });
  });

  it("states the order-point count the platform line was priced on", () => {
    expect(quote.orderPoints).toEqual({ hardware: { "POS Unit": 2 }, channels: ["website"], total: 3 });
  });

  it("still leaks no internal field with lines attached", () => {
    const serialized = JSON.stringify(quote);
    for (const forbidden of ["margin", "Margin", "floor", "Floor", "adyen", "Adyen", "cost", "bps", "interchange", "aioRevenue"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("buildCustomerSafeQuote — statement basis", () => {
  const analysis = {
    totalVolume: 100_000,
    totalTransactions: 2500,
    totalFees: 3_500,
    averageTicket: 40,
    interchangeRate: 0.018,
    icEstimated: false,
    cardPresentPct: 0.8,
    cardNotPresentPct: 0.2,
    cardPresentVolume: 80_000,
    cardNotPresentVolume: 20_000,
  } as StatementAnalysis;

  it("compares against the statement's own fee total", () => {
    const quote = buildCustomerSafeQuote({
      analysis, quoteConfig: null, targetMargin: 0.008, pricingModel: "2-tier",
    })!;
    // Itemized interchange, so each lane keeps the statement's blended rate:
    // 100,000 × (1.80% + 0.80%) = $2,600.
    expect(quote.basis).toBe("statement");
    expect(quote.projectedMonthlyCost).toBeCloseTo(2600, 6);
    expect(quote.currentMonthlyCost).toBe(3500);
    expect(quote.currentEffectiveRate).toBeCloseTo(0.035, 10);
    expect(quote.monthlySavings).toBeCloseTo(900, 6);
    expect(quote.annualSavings).toBeCloseTo(10_800, 6);
    expect(quote.savingsPct).toBeCloseTo(900 / 3500, 10);
  });

  it("takes precedence over a quoteConfig on the same application", () => {
    const quote = buildCustomerSafeQuote({
      analysis,
      quoteConfig: { avgTicket: 5, monthlyVolume: 1_000 },
      targetMargin: 0.008,
      pricingModel: "2-tier",
    })!;
    expect(quote.basis).toBe("statement");
    expect(quote.monthlyVolume).toBe(100_000);
  });
});

describe("hasQuoteBasis", () => {
  const none = { analysis: null, quoteConfig: null, targetMargin: null, pricingModel: null };

  it("is false with neither a statement nor configs", () => {
    expect(hasQuoteBasis(none)).toBe(false);
    expect(buildCustomerSafeQuote(none)).toBeNull();
  });

  it("is false for a config with no volume, and no quote comes out of it", () => {
    const basis = { ...none, quoteConfig: { avgTicket: 40, monthlyVolume: 0 } };
    expect(hasQuoteBasis(basis)).toBe(false);
    expect(buildCustomerSafeQuote(basis)).toBeNull();
  });

  it("is true once either side is present", () => {
    expect(hasQuoteBasis({ ...none, quoteConfig: CONFIG })).toBe(true);
    expect(hasQuoteBasis({ ...none, analysis: { totalVolume: 1 } as StatementAnalysis })).toBe(true);
  });

  it("is false for a statement whose volume didn't read", () => {
    // A mis-read statement used to pass this gate and fail the render, which
    // marked the deal quote_sent and let /accept record an acceptance of a
    // quote that draws as nothing.
    const basis = { ...none, analysis: { totalVolume: 0, totalFees: 900 } as StatementAnalysis };
    expect(hasQuoteBasis(basis)).toBe(false);
    expect(buildCustomerSafeQuote(basis)).toBeNull();
  });

  it("never disagrees with buildCustomerSafeQuote — one predicate, no drift", () => {
    const cases = [
      none,
      { ...none, quoteConfig: CONFIG },
      { ...none, quoteConfig: { avgTicket: 40, monthlyVolume: 0 } },
      { ...none, analysis: { totalVolume: 0 } as StatementAnalysis },
      { ...none, analysis: { totalVolume: 50_000 } as StatementAnalysis },
      // A statement that read as zero does NOT fall back to the configs — the
      // statement wins in buildCustomerSafeQuote, so it has to win here too.
      { ...none, analysis: { totalVolume: 0 } as StatementAnalysis, quoteConfig: CONFIG },
    ];
    for (const basis of cases) {
      expect(hasQuoteBasis(basis)).toBe(buildCustomerSafeQuote(basis) !== null);
    }
  });
});
