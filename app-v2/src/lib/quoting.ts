// Quote-line arithmetic and the ordering-point pricing rule.
//
// Pure and dependency-free on purpose: no DB, no HubSpot, no pricing.ts. That
// keeps it unit-testable AND safe to import from a client component — nothing
// in here is an AIO internal (no margin, no cost, no floor). The catalog it
// operates on is read from HubSpot server-side and passed in.

import { monthlyEquivalent } from "@/lib/utils";
import type { BillingFrequency, CatalogProduct, OrderPoints, QuoteLine, QuoteTotals } from "@/types/merchant";

// ── The rep-facing picker ───────────────────────────────────────────────────

// Products a rep must not be able to put on a quote by hand. `listProducts()`
// already drops the TEST product and anything inactive; these are the further
// exclusions E2E-PLAN.md recommends.
//
// OPEN DECISION (E2E-PLAN.md "Catalog data hygiene"): the plan *recommends*
// hiding these but nobody has signed off, so the list is named and commented
// rather than inlined. Reverting any single entry is a one-line change.
//   - the two "AIO Payment Processing" entries are $0 placeholders; processing
//     margin is taken out of Adyen settlement, never billed through HubSpot
//   - "CAMP Invoice" is a billing artifact, not something a rep sells
//   - "AIO Pre Auth" ($0.50/Service) is a PER-TRANSACTION fee — quoting it as a
//     single $0.50 line is meaningless
//   - the two platform tiers are excluded because they are DERIVED from the
//     ordering-point count (see below), not chosen; they still land on the
//     quote, just not by hand
export const PICKER_EXCLUDED_PRODUCT_NAMES = [
  "AIO Processing Two Tiered Rate",
  "AIO Tier Processing",
  "CAMP Invoice",
  "AIO Pre Auth",
] as const;

export function isPickable(product: CatalogProduct): boolean {
  return (
    !PICKER_EXCLUDED_PRODUCT_NAMES.includes(product.name as (typeof PICKER_EXCLUDED_PRODUCT_NAMES)[number]) &&
    !isPlatformTierProduct(product.name)
  );
}

// HubSpot's hs_product_type values, in the order a configurator should show
// them. Untyped products get their own bucket instead of disappearing — four
// live catalog entries carry no type and would otherwise be invisible.
export const UNCATEGORIZED_GROUP = "Uncategorized";

const GROUP_ORDER = ["inventory", "Software", "Service", UNCATEGORIZED_GROUP];

export const PRODUCT_GROUP_LABELS: Record<string, string> = {
  inventory: "Hardware",
  Software: "Software",
  Service: "Service",
  [UNCATEGORIZED_GROUP]: UNCATEGORIZED_GROUP,
};

export function groupProducts(products: CatalogProduct[]): Array<{ type: string; label: string; products: CatalogProduct[] }> {
  const groups = new Map<string, CatalogProduct[]>();
  for (const p of products) {
    const key = p.productType || UNCATEGORIZED_GROUP;
    const bucket = groups.get(key);
    if (bucket) bucket.push(p);
    else groups.set(key, [p]);
  }
  return [...groups.entries()]
    .sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a[0]), bi = GROUP_ORDER.indexOf(b[0]);
      return (ai === -1 ? GROUP_ORDER.length : ai) - (bi === -1 ? GROUP_ORDER.length : bi);
    })
    .map(([type, list]) => ({ type, label: PRODUCT_GROUP_LABELS[type] ?? type, products: list }));
}

/** Snapshot a catalog product onto the quote. Price and frequency are frozen here. */
export function toQuoteLine(product: CatalogProduct, qty: number): QuoteLine {
  return {
    hubspotProductId: product.hubspotProductId,
    name: product.name,
    qty,
    unitPrice: product.price,
    billingFrequency: product.billingFrequency,
    productType: product.productType,
  };
}

// ── Frequency-aware totals ──────────────────────────────────────────────────

const FREQUENCY_SORT: BillingFrequency[] = [
  "weekly", "biweekly", "monthly", "quarterly", "per_six_months",
  "annually", "per_two_years", "per_three_years", "per_four_years", "per_five_years",
];

/**
 * Three totals that must never be added together: what's due once, what's due
 * per recurring cycle (grouped BY cycle, because a weekly $99 and a monthly $39
 * are not the same unit), and the monthly-equivalent normalization that makes
 * the recurring side comparable to a statement's monthly figures.
 */
export function quoteTotals(lines: QuoteLine[]): QuoteTotals {
  let oneTime = 0;
  const byCycle = new Map<BillingFrequency, number>();
  let monthly = 0;

  for (const line of lines) {
    const amount = line.unitPrice * line.qty;
    if (line.billingFrequency === "one_time") {
      oneTime += amount;
      continue;
    }
    byCycle.set(line.billingFrequency, (byCycle.get(line.billingFrequency) ?? 0) + amount);
    monthly += monthlyEquivalent(amount, line.billingFrequency);
  }

  return {
    oneTime,
    recurring: [...byCycle.entries()]
      .sort((a, b) => FREQUENCY_SORT.indexOf(a[0]) - FREQUENCY_SORT.indexOf(b[0]))
      .map(([frequency, amount]) => ({ frequency, amount })),
    monthlyEquivalent: monthly,
  };
}

// ── Ordering points ─────────────────────────────────────────────────────────

// THE pricing rule. It lives here — in EasyOB — and deliberately NOT in the
// aioinventory endpoint: the endpoint returns raw category counts, and this
// mapping changes whenever the tier definition does.
//
// Keyed by the trimmed HubSpot catalog product name for readability, but every
// rule also carries its live `hubspotProductId` and THAT is what a quote line
// is matched on first (see `ruleForLine`). The catalog is maintained in HubSpot
// by non-engineers: renaming "Mega Kiosk" must not silently stop counting it.
// The name stays as the fallback for a product created after this list.
//
// Rules confirmed by Steve 2026-08-18 (E2E-PLAN.md, "Which categories count"):
// POS terminals count 1 each; a kiosk counts 1 each, NOT one per lane; MPOS and
// Tableside AI Devices count. Payment terminals, card readers, customer-facing
// displays, KDS, printers, menu boards, mounts, network gear and cash drawers
// do not. Tablets are conditional and cannot be resolved from a product record,
// so they default to 0 and are surfaced for human review — over-billing is the
// worse direction to be wrong in ($433/mo either way).
type OrderPointRule = {
  pointsPerUnit: number;
  /** Live HubSpot product id — the primary key, so a rename can't drop the rule. */
  hubspotProductId?: string;
  /** Set when the count is a human judgement the catalog can't make for us. */
  needsReview?: string;
};

export const ORDER_POINT_RULES: Record<string, OrderPointRule> = {
  // Counts
  "POS Unit": { pointsPerUnit: 1, hubspotProductId: "217445755632" },
  "POS Unit - With Customer Facing Display": { pointsPerUnit: 1, hubspotProductId: "223452690130" },
  "mPOS": { pointsPerUnit: 1, hubspotProductId: "223511653101" },
  "Mega Kiosk": { pointsPerUnit: 1, hubspotProductId: "260674226888" },
  "Kiosk + Payment Terminal (AMS1) and Mount": { pointsPerUnit: 1, hubspotProductId: "222497165009" },
  "Kiosk Mini + Payment Terminal (AMS1) and Mount": { pointsPerUnit: 1, hubspotProductId: "223519571666" },

  // Needs review — quantity is a judgement, so it contributes 0 by default
  "Orders Hub Tablet": {
    pointsPerUnit: 0,
    hubspotProductId: "276751313619",
    needsReview: "Tablets count only when deployed as a POS replacement — confirm with the rep.",
  },
  "Clock in Tablet": {
    pointsPerUnit: 0,
    hubspotProductId: "276754193118",
    needsReview: "Named as a time clock, but it is a tablet — confirm it isn't taking orders.",
  },
  "QSR POS Hardware Bundle": {
    pointsPerUnit: 0,
    hubspotProductId: "252941875920",
    needsReview: "Bundle — confirm how many POS terminals it contains.",
  },

  // Explicitly does not count
  "Payment Terminal - AMS1": { pointsPerUnit: 0, hubspotProductId: "223511653105" },
  "Customer Facing Display": { pointsPerUnit: 0, hubspotProductId: "318736467644" },
  "Kitchen Display System": { pointsPerUnit: 0, hubspotProductId: "223452690132" },
  "Kitchen Display for Customer": { pointsPerUnit: 0, hubspotProductId: "265825703641" },
  "Menu Board Computer": { pointsPerUnit: 0, hubspotProductId: "223511653103" },
  "Thermal Printer": { pointsPerUnit: 0, hubspotProductId: "223511653104" },
  "Epson Sticky Printer": { pointsPerUnit: 0, hubspotProductId: "250458906315" },
  "Cash Drawer": { pointsPerUnit: 0, hubspotProductId: "222497165011" },
  "AIO WiFi Network Package": { pointsPerUnit: 0, hubspotProductId: "281351401209" },
  "Large TV (75in)": { pointsPerUnit: 0, hubspotProductId: "316081071858" },
  "Medium TV (50in to 65in)": { pointsPerUnit: 0, hubspotProductId: "316074591968" },
  "Small TV (32in to 43in)": { pointsPerUnit: 0, hubspotProductId: "316076031729" },
};

const RULES_BY_PRODUCT_ID = new Map(
  Object.values(ORDER_POINT_RULES)
    .filter(r => r.hubspotProductId)
    .map(r => [r.hubspotProductId!, r] as const)
);

/** Product id first, trimmed display name as the fallback. */
export function ruleForLine(line: { hubspotProductId: string; name: string }): OrderPointRule | undefined {
  return RULES_BY_PRODUCT_ID.get(line.hubspotProductId) ?? ORDER_POINT_RULES[line.name.trim()];
}

// Product types that are never physical ordering hardware. A line with one of
// these and no rule isn't "unclassified" — it simply doesn't carry points.
// Anything else with no rule (inventory, or untyped) does get flagged.
const NON_HARDWARE_PRODUCT_TYPES = ["Software", "Service"];

// Ordering points that will never appear in an inventory system or on a
// hardware line. A website IS an ordering point — Steve called this one out
// specifically — so it has to be declared on the deal or the count is wrong.
export const ORDER_POINT_CHANNELS: Array<{ id: string; label: string; note?: string }> = [
  { id: "website", label: "Website / online ordering", note: "Counts — confirmed" },
  { id: "qr", label: "QR code ordering" },
  { id: "third_party_delivery", label: "Third-party delivery" },
  { id: "phone_ai", label: "Phone-AI ordering" },
];

export const CHANNEL_LABELS: Record<string, string> = Object.fromEntries(
  ORDER_POINT_CHANNELS.map(c => [c.id, c.label])
);

export type OrderPointsBreakdown = {
  orderPoints: OrderPoints;
  /** Hardware whose contribution a human has to settle. Never silently counted, never dropped. */
  needsReview: Array<{ name: string; qty: number; reason: string }>;
  /** Hardware the mapping doesn't know about. Contributes 0, but must stay visible. */
  unclassified: Array<{ name: string; qty: number }>;
};

/**
 * The QUOTED order-point count: order-point-bearing hardware lines plus the
 * non-hardware channels declared on the deal. (The DEPLOYED count is a
 * different thing entirely and comes from aioinventory — Phase H item 4/5.)
 */
export function deriveOrderPoints(lines: QuoteLine[], channels: string[]): OrderPointsBreakdown {
  const hardware: Record<string, number> = {};
  const needsReview: OrderPointsBreakdown["needsReview"] = [];
  const unclassified: OrderPointsBreakdown["unclassified"] = [];
  let total = 0;

  for (const line of lines) {
    // Every line is run through the rules, whatever hs_product_type says. The
    // type is HubSpot data maintained by hand: an untyped or mis-typed kiosk
    // must still count its point, and must still land in `unclassified` when
    // no rule knows it — the type gate used to swallow both.
    const rule = ruleForLine(line);
    if (!rule) {
      // Software/services with no rule are 0 by definition, not a mystery.
      if (!NON_HARDWARE_PRODUCT_TYPES.includes((line.productType || "").trim())) {
        unclassified.push({ name: line.name, qty: line.qty });
      }
      continue;
    }
    if (rule.needsReview) needsReview.push({ name: line.name, qty: line.qty, reason: rule.needsReview });
    if (rule.pointsPerUnit > 0) {
      const points = rule.pointsPerUnit * line.qty;
      hardware[line.name] = (hardware[line.name] ?? 0) + points;
      total += points;
    }
  }

  const declared = ORDER_POINT_CHANNELS.filter(c => channels.includes(c.id)).map(c => c.id);
  total += declared.length;

  return { orderPoints: { hardware, channels: declared, total }, needsReview, unclassified };
}

// ── Platform tier (derived, not chosen) ─────────────────────────────────────

// The largest recurring line on any quote, and a $433/mo swing across the
// boundary, so it follows the count rather than a rep's dropdown.
export const PLATFORM_TIER_BOUNDARY = 5; // 1–5 inclusive, then 6+

export const PLATFORM_TIER_PRODUCT_NAMES = {
  small: "AIO Platform (1 to 5 Order Points)",
  large: "AIO Platform (6 + Order Points)",
} as const;

// Same reason as ORDER_POINT_RULES: the id is the stable key, the name is only
// the fallback for a catalog record we haven't seen.
export const PLATFORM_TIER_PRODUCT_IDS: Record<string, string> = {
  [PLATFORM_TIER_PRODUCT_NAMES.small]: "217526517443",
  [PLATFORM_TIER_PRODUCT_NAMES.large]: "292286544587",
};

// Not order-point tiered — a food truck is priced flat. When a rep quotes it,
// the derived tier line is suppressed so a quote can't carry two platform fees.
export const FOOD_TRUCK_PLATFORM_NAME = "AIO Platform - Food Truck";
export const FOOD_TRUCK_PLATFORM_ID = "247900575472";

export function isPlatformTierProduct(name: string): boolean {
  return name === PLATFORM_TIER_PRODUCT_NAMES.small || name === PLATFORM_TIER_PRODUCT_NAMES.large;
}

/** Which tier product a given order-point total selects. Zero points selects nothing. */
export function platformTierNameFor(total: number): string | null {
  if (total <= 0) return null;
  return total <= PLATFORM_TIER_BOUNDARY ? PLATFORM_TIER_PRODUCT_NAMES.small : PLATFORM_TIER_PRODUCT_NAMES.large;
}

export type PlatformTierResult =
  /** The tier line to put on the quote. */
  | { status: "resolved"; line: QuoteLine; tierName: string }
  /** Zero ordering points — no platform fee is due. */
  | { status: "none_needed"; line: null; tierName: null }
  /** A flat-priced food-truck platform is already quoted; the tier doesn't apply. */
  | { status: "food_truck"; line: null; tierName: null }
  /** A tier IS due but the catalog didn't yield it. Never quietly quote without it. */
  | { status: "unresolved"; line: null; tierName: string };

/**
 * The platform-fee line implied by the order-point count, snapshotted from the
 * catalog like any other line.
 *
 * Returns a status rather than a bare null because the three "no line" cases
 * are not the same thing: two are correct, and the third — a tier is owed but
 * the catalog didn't yield the product — is the largest recurring charge on the
 * quote going missing. That case must reach the rep and must block the save.
 */
export function resolvePlatformTier(total: number, catalog: CatalogProduct[], lines: QuoteLine[]): PlatformTierResult {
  const foodTruck = lines.some(
    l => l.hubspotProductId === FOOD_TRUCK_PLATFORM_ID || l.name.trim() === FOOD_TRUCK_PLATFORM_NAME
  );
  if (foodTruck) return { status: "food_truck", line: null, tierName: null };
  const tierName = platformTierNameFor(total);
  if (!tierName) return { status: "none_needed", line: null, tierName: null };

  const tierId = PLATFORM_TIER_PRODUCT_IDS[tierName];
  const product =
    catalog.find(p => p.hubspotProductId === tierId) ?? catalog.find(p => p.name.trim() === tierName);
  return product
    ? { status: "resolved", line: toQuoteLine(product, 1), tierName }
    : { status: "unresolved", line: null, tierName };
}
