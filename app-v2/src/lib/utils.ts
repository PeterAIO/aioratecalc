import type { BillingFrequency } from "@/types/merchant";

export const fmt$ = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n || 0);

export const fmt$0 = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

export const fmtPct  = (n: number | null | undefined) => `${((n || 0) * 100).toFixed(4)}%`;
export const fmtPct2 = (n: number | null | undefined) => `${((n || 0) * 100).toFixed(2)}%`;
export const fmtBps  = (n: number | null | undefined) => `${Math.round((n || 0) * 10000)} bps`;

// How many times a billing frequency charges per month. Weekly is 52/12, NOT 4 —
// this is the factor that turns a catalog price into a comparable monthly figure.
// AIO's platform fees bill weekly, so treating a $99 catalog price as $99/month
// understates it by 4.33x. "one_time" is 0: it never recurs, so it must be
// totalled separately rather than folded into a monthly number.
const MONTHLY_CHARGES: Record<BillingFrequency, number> = {
  one_time: 0,
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  per_six_months: 1 / 6,
  annually: 1 / 12,
  per_two_years: 1 / 24,
  per_three_years: 1 / 36,
  per_four_years: 1 / 48,
  per_five_years: 1 / 60,
};

export const monthlyEquivalent = (amount: number, frequency: BillingFrequency) =>
  amount * MONTHLY_CHARGES[frequency];

// Per-cycle label for a quote line, e.g. "$99.00/week". One-time lines have no
// cycle, so callers should render those as a plain amount instead.
const FREQUENCY_LABELS: Record<BillingFrequency, string> = {
  one_time: "one-time",
  weekly: "week",
  biweekly: "2 weeks",
  monthly: "month",
  quarterly: "quarter",
  per_six_months: "6 months",
  annually: "year",
  per_two_years: "2 years",
  per_three_years: "3 years",
  per_four_years: "4 years",
  per_five_years: "5 years",
};

export const fmtFrequency = (frequency: BillingFrequency) => FREQUENCY_LABELS[frequency];

export function parseJSON(text: string): Record<string, unknown> | null {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const s = clean.indexOf("{");
    const e = clean.lastIndexOf("}");
    if (s !== -1 && e !== -1) return JSON.parse(clean.slice(s, e + 1));
  } catch {}
  return null;
}
