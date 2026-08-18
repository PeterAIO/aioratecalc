// The single place a MerchantApplication turns into something a customer is
// allowed to see. Both customer-facing entry points go through it — the
// prepared-quote render on /lead/[token] and the post-upload response from
// /api/lead/[token]/analyze — so "the customer never sees internals" is one
// projection to audit rather than two.
//
// SERVER-ONLY in practice (no "server-only" guard so it stays unit-testable):
// this imports pricing.ts, and pulling that into a client bundle would ship
// MARGIN_REQS — AIO's true margin floors — to the browser. Same rule as
// pricing.ts itself. Client components receive the returned CustomerSafeQuote
// as a prop; they never import this module.
import { analysisFromQuoteConfig, derivePricing, type FeeOverrides } from "@/lib/pricing";
import { quoteTotals } from "@/lib/quoting";
import type {
  CustomerSafeQuote, OrderPoints, QuoteConfig, QuoteLine, StatementAnalysis,
} from "@/types/merchant";

// What a quote can be built from. Mirrors the application columns that matter
// here, so callers can pass a raw DB row or a MerchantApplication.
export type QuoteBasis = {
  analysis: StatementAnalysis | null;
  quoteConfig: QuoteConfig | null;
  targetMargin: number | null;
  pricingModel: string | null;
  // Phase C. Optional so the rate-only callers and their tests are unchanged.
  quoteLines?: QuoteLine[] | null;
  orderPoints?: OrderPoints | null;
};

// Customer-facing quotes carry no separate per-transaction or monthly fee —
// the rep's fee overrides are a proposal-building concern on the rep side.
const NO_FEE_OVERRIDES: FeeOverrides = { monthlyFee: 0, perTxnFee: 0, cpPerTxnFee: 0, cnpPerTxnFee: 0 };

/**
 * The one gate. `hasQuoteBasis` and `buildCustomerSafeQuote` both go through
 * it, so "a quote exists" and "a quote renders" can never disagree — a
 * mis-read statement (volume 0) used to pass the first and fail the second,
 * which marked a deal quote_sent and let it be accepted with nothing on screen.
 */
function quotableAnalysis(basis: QuoteBasis): StatementAnalysis | null {
  const analysis = basis.analysis ?? (basis.quoteConfig ? analysisFromQuoteConfig(basis.quoteConfig) : null);
  if (!analysis || !(analysis.totalVolume > 0)) return null;
  return analysis;
}

/** True when there is enough on the application to show a quote without asking for a statement. */
export function hasQuoteBasis(basis: QuoteBasis): boolean {
  return quotableAnalysis(basis) !== null;
}

/**
 * Build the customer-safe quote, or null when there is no basis for one.
 * A statement analysis always wins over quoteConfig: the config is the
 * no-statement base, not an override.
 */
export function buildCustomerSafeQuote(basis: QuoteBasis): CustomerSafeQuote | null {
  const analysis = quotableAnalysis(basis);
  if (!analysis) return null;
  const fromStatement = !!basis.analysis;
  const vol = analysis.totalVolume;

  // undefined (not null) lets derivePricing fall back to the volume tier's
  // desired margin from Steve's matrix rather than a flat default.
  const targetMargin = basis.targetMargin ?? undefined;
  const pricingModel = basis.pricingModel || "2-tier";
  const pricing = derivePricing(analysis, targetMargin, pricingModel, NO_FEE_OVERRIDES);

  // Hardware/platform/service lines are customer-safe as they stand — they're
  // what gets printed on the quote. Totals are computed here rather than in the
  // view so the "never sum across billing frequencies" rule has one owner.
  const lines = basis.quoteLines ?? [];

  const projectedMonthlyCost = pricing.projectedMonthlyFees;
  // Savings require a current cost. Only a statement supplies one.
  const currentMonthlyCost = fromStatement ? (analysis.totalFees || 0) : null;
  const monthlySavings = currentMonthlyCost !== null ? currentMonthlyCost - projectedMonthlyCost : null;

  return {
    basis: fromStatement ? "statement" : "config",
    monthlyVolume: vol,
    averageTicket: analysis.averageTicket || (analysis.totalTransactions > 0 ? vol / analysis.totalTransactions : 0),
    effectiveRate: projectedMonthlyCost / vol,
    projectedMonthlyCost,
    projectedAnnualCost: projectedMonthlyCost * 12,
    currentMonthlyCost,
    currentEffectiveRate: currentMonthlyCost !== null ? currentMonthlyCost / vol : null,
    monthlySavings,
    annualSavings: monthlySavings !== null ? monthlySavings * 12 : null,
    savingsPct: monthlySavings !== null && currentMonthlyCost ? monthlySavings / currentMonthlyCost : null,
    lines,
    lineTotals: lines.length ? quoteTotals(lines) : null,
    orderPoints: basis.orderPoints ?? null,
  };
}
