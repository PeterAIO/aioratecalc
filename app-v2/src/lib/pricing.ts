// Verbatim port of pricing logic from clearrate-main/index.html
// DO NOT change these values — they come from AIO Payments Margin Requirements.xlsx

import type { ProcessorTier } from "@/types/merchant";

export const MARGIN_REQS = [
  { maxVol: 20000,   takeRate: 0.015,  minMRR: 300    },
  { maxVol: 50000,   takeRate: 0.006,  minMRR: 300    },
  { maxVol: 75000,   takeRate: 0.005,  minMRR: 375    },
  { maxVol: 100000,  takeRate: 0.004,  minMRR: 400    },
  { maxVol: 125000,  takeRate: 0.0035, minMRR: 437.5  },
  { maxVol: 150000,  takeRate: 0.003,  minMRR: 450    },
  { maxVol: 175000,  takeRate: 0.0025, minMRR: 437.5  },
  { maxVol: 200000,  takeRate: 0.002,  minMRR: 400    },
  { maxVol: 250000,  takeRate: 0.0018, minMRR: 450    },
  { maxVol: 300000,  takeRate: 0.0016, minMRR: 480    },
  { maxVol: 350000,  takeRate: 0.0014, minMRR: 490    },
  { maxVol: 400000,  takeRate: 0.0012, minMRR: 480    },
  { maxVol: 500000,  takeRate: 0.001,  minMRR: 500    },
  { maxVol: Infinity, takeRate: 0.0008, minMRR: 480   },
];

export function getMarginFloor(monthlyVolume: number) {
  return MARGIN_REQS.find(t => monthlyVolume <= t.maxVol) || MARGIN_REQS[MARGIN_REQS.length - 1];
}

export function calcAdyenCost(tier: ProcessorTier, volume: number, txnCount: number): number {
  if (!tier) return 0;
  return (
    volume * (tier.processingBps || 0) +
    txnCount * (tier.perTxnFee || 0) +
    volume * (tier.schemeBps || 0) +
    (tier.monthlyFee || 0)
  );
}

export function adyenRateOnVolume(tier: ProcessorTier | null, volume: number, txnCount: number): number {
  if (!tier || !volume) return 0;
  return calcAdyenCost(tier, volume, txnCount) / volume;
}

// Industry-standard blended interchange estimates for tiered/hidden-IC statements
export const INTERCHANGE_SCHEDULE = {
  cardPresent:    { rate: 0.0160, perTxn: 0.10 },
  cardNotPresent: { rate: 0.0205, perTxn: 0.15 },
};

export type FeeOverrides = {
  monthlyFee: number;
  perTxnFee: number;
  cpPerTxnFee: number;
  cnpPerTxnFee: number;
};

export type DerivedPricing = {
  flatRate: number;
  cpRate: number;
  cnpRate: number;
  bps: number;           // interchange-plus basis points (above IC)
  perTxnFee: number;     // effective per-txn fee used
  projectedMonthlyFees: number;
  aioRevenue: number;    // projected AIO monthly revenue
  marginFloor: number;   // minimum MRR floor for this volume tier
  cpVol: number;
  cnpVol: number;
  cpPct: number;
  cnpPct: number;
};

export function derivePricing(
  analysis: { totalVolume: number; totalTransactions: number; interchangeRate: number; cardPresentPct?: number; cardNotPresentPct?: number; cardPresentVolume?: number; cardNotPresentVolume?: number },
  targetMargin: number,
  pricingModel: string,
  feeOverrides: FeeOverrides
): DerivedPricing {
  const vol   = analysis.totalVolume || 0;
  const txns  = analysis.totalTransactions || 0;
  const icRate = analysis.interchangeRate || 0;

  const cpPct  = analysis.cardPresentPct    || 0.7;
  const cnpPct = analysis.cardNotPresentPct || 0.3;
  const cpVol  = analysis.cardPresentVolume  || vol * cpPct;
  const cnpVol = analysis.cardNotPresentVolume || vol * cnpPct;

  const cpIcRate  = cpVol  > 0 ? (icRate * vol * cpPct)  / cpVol  : icRate * 0.85;
  const cnpIcRate = cnpVol > 0 ? (icRate * vol * cnpPct) / cnpVol : icRate * 1.15;

  // Flat rate
  const flatRevNeeded    = vol * targetMargin;
  const flatFeeRevenue   = txns * (feeOverrides.perTxnFee || 0) + (feeOverrides.monthlyFee || 0);
  const flatPctRevNeeded = Math.max(0, flatRevNeeded - flatFeeRevenue);
  const derivedFlatRate  = icRate + flatPctRevNeeded / (vol || 1);

  // 2-tier
  const cpRevNeeded  = cpVol  * targetMargin;
  const cnpRevNeeded = cnpVol * targetMargin;
  const cpFeeRev     = txns * cpPct  * (feeOverrides.cpPerTxnFee  || 0) + (feeOverrides.monthlyFee || 0) * cpPct;
  const cnpFeeRev    = txns * cnpPct * (feeOverrides.cnpPerTxnFee || 0) + (feeOverrides.monthlyFee || 0) * cnpPct;
  const derivedCPRate  = cpIcRate  + Math.max(0, cpRevNeeded  - cpFeeRev)  / (cpVol  || 1);
  const derivedCNPRate = cnpIcRate + Math.max(0, cnpRevNeeded - cnpFeeRev) / (cnpVol || 1);

  const bps        = Math.round(targetMargin * 10000);
  const perTxnFee  = feeOverrides.perTxnFee || 0;

  let projectedMonthlyFees = 0;
  if (pricingModel === "flat-rate") {
    projectedMonthlyFees = vol * derivedFlatRate + txns * perTxnFee + (feeOverrides.monthlyFee || 0);
  } else if (pricingModel === "2-tier") {
    projectedMonthlyFees =
      cpVol * derivedCPRate + txns * cpPct * (feeOverrides.cpPerTxnFee || 0) +
      cnpVol * derivedCNPRate + txns * cnpPct * (feeOverrides.cnpPerTxnFee || 0) +
      (feeOverrides.monthlyFee || 0);
  } else {
    projectedMonthlyFees = vol * icRate + vol * targetMargin + txns * perTxnFee + (feeOverrides.monthlyFee || 0);
  }

  const floorTier   = getMarginFloor(vol);
  const marginFloor = Math.max(vol * floorTier.takeRate, floorTier.minMRR);
  // aioRevenue = projected - what merchant would pay at IC-only
  const icOnlyCost  = vol * icRate;
  const aioRev      = projectedMonthlyFees - icOnlyCost;

  return {
    flatRate: derivedFlatRate,
    cpRate: derivedCPRate,
    cnpRate: derivedCNPRate,
    bps, perTxnFee,
    projectedMonthlyFees,
    aioRevenue: Math.max(0, aioRev),
    marginFloor,
    cpVol, cnpVol, cpPct, cnpPct,
  };
}

// Global admin-set padding applied to the true floor/cost before a rep is
// allowed to see it — reps must never discover or undercut AIO's actual
// rock-bottom margin. Pure function; the active policy is fetched from the
// margin_policy table by the caller (see lib/actions/pricing.ts) and passed
// in here, keeping this file free of DB access.
export type PaddingConfig = {
  paddingBps: number;          // padding added to the true floor's take-rate, in basis points
  paddingMinMrrAdd: number;    // flat padding added to the true minMRR floor
  paddingAdyenCostHide: boolean; // whether the exact Adyen cost rate is hidden from reps
};

export function getPaddedFloor(
  trueFloor: { takeRate: number; minMRR: number },
  padding: PaddingConfig
): { takeRate: number; minMRR: number } {
  return {
    takeRate: trueFloor.takeRate + padding.paddingBps / 10000,
    minMRR: trueFloor.minMRR + padding.paddingMinMrrAdd,
  };
}

export type RoleScopedPricing = DerivedPricing & {
  belowCostFloor: boolean;      // computed from the TRUE Adyen cost server-side; the cost itself is never derived from this flag
  adyenCostRate: number | null; // null when hidden from this role (reps, per paddingAdyenCostHide)
};

// Returns a pricing view scoped to who's asking. Admins get the true
// marginFloor/adyenCostRate; everyone else gets the padded floor and
// (per policy) a redacted cost, plus a safe belowCostFloor boolean computed
// from the true numbers without ever exposing them.
export function derivePricingForRole(
  analysis: Parameters<typeof derivePricing>[0],
  targetMargin: number,
  pricingModel: string,
  feeOverrides: FeeOverrides,
  role: "admin" | "rep",
  activeTier: ProcessorTier | null,
  padding: PaddingConfig
): RoleScopedPricing {
  const result = derivePricing(analysis, targetMargin, pricingModel, feeOverrides);
  const trueAdyenCostRate = activeTier ? adyenRateOnVolume(activeTier, analysis.totalVolume, analysis.totalTransactions) : 0;
  const belowCostFloor = !!activeTier && targetMargin - trueAdyenCostRate < 0;

  if (role === "admin") {
    return { ...result, belowCostFloor, adyenCostRate: activeTier ? trueAdyenCostRate : null };
  }

  const vol = analysis.totalVolume || 0;
  const paddedFloor = getPaddedFloor(getMarginFloor(vol), padding);
  const paddedMarginFloor = Math.max(vol * paddedFloor.takeRate, paddedFloor.minMRR);

  return {
    ...result,
    marginFloor: paddedMarginFloor,
    belowCostFloor,
    adyenCostRate: padding.paddingAdyenCostHide ? null : trueAdyenCostRate,
  };
}
