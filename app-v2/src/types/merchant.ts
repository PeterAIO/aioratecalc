export type PricingModel = "flat-rate" | "2-tier" | "interchange-plus";

export type DealStage =
  | "prospect_created"      // rep created a prospect + set a margin target, no link sent yet
  | "lead_link_sent"        // rep sent the tokenized self-serve upload link, awaiting customer
  | "quote_sent"            // link sent with a quote already prepared (rep set configs and/or uploaded the statement)
  | "lead_analysis_pending" // customer clicked the link and uploaded a statement, analyzing
  | "analysis"
  | "pricing"
  | "proposal_ready"
  | "proposal_sent"
  | "quote_accepted"        // customer explicitly accepted the quote on the customer quote view
  | "merchant_link_sent"    // post-proposal Adyen KYC handoff link sent (see customerLinkPurpose)
  | "merchant_filling"
  | "adyen_kyc_pending"
  | "adyen_kyc_complete"
  | "adyen_approved"
  | "closed_lost";

export type StatementAnalysis = {
  merchantName: string;
  processingMonth: string;
  totalVolume: number;
  totalTransactions: number;
  totalFees: number;
  interchangeFees: number;
  processorFees: number;
  otherFees: number;
  effectiveRate: number;
  interchangeRate: number;
  processorMarkup: number;
  statedMarkupRate: number;
  statedPerTxnFee: number;
  interchangeNotShown: boolean;
  averageTicket: number;
  cardPresentVolume: number;
  cardNotPresentVolume: number;
  cardPresentPct: number;
  cardNotPresentPct: number;
  visaVolume: number;
  mastercardVolume: number;
  amexVolume: number;
  discoverVolume: number;
  rewardCardPct: number;
  corporateCardPct: number;
  currentPricingModel: PricingModel | "unknown";
  currentProcessorName: string;
  annualVolume: number;
  confidence: "high" | "medium" | "low";
  notes: string;
  currentMargin: number;
  icEstimated?: boolean;
};

export type ProposedRatesFlatRate = {
  pricingModel: "flat-rate";
  flatRate: number;
  perTransaction: number;
  monthlyFee: number;
};
export type ProposedRates2Tier = {
  pricingModel: "2-tier";
  cardPresentRate: number;
  cardPresentPerTxn: number;
  cardNotPresentRate: number;
  cardNotPresentPerTxn: number;
  monthlyFee: number;
};
export type ProposedRatesIcPlus = {
  pricingModel: "interchange-plus";
  basisPoints: number;
  perTransaction: number;
  monthlyFee: number;
};
export type ProposedRates = ProposedRatesFlatRate | ProposedRates2Tier | ProposedRatesIcPlus;

export type ProposalOutput = {
  pricingModel: PricingModel;
  proposedRates: ProposedRates;
  projectedFees: { monthly: number; annual: number; effectiveRate: number };
  currentFees: { monthly: number; annual: number; effectiveRate: number };
  savings: { monthly: number; annual: number; savingsPct: number };
  sellingPoints: string[];
  proposalSummary: string;
};

// HubSpot's own billing-frequency enum, plus "one_time" for catalog items that
// carry no recurringbillingfrequency (hardware, installation). Kept identical to
// HubSpot's values so a quote line maps straight onto a line item.
export type BillingFrequency =
  | "one_time"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "per_six_months"
  | "annually"
  | "per_two_years"
  | "per_three_years"
  | "per_four_years"
  | "per_five_years";

// A product as it exists in AIO's HubSpot catalog. Read-only mirror — the
// catalog is maintained in HubSpot, never here.
// NOTE: `price` is per BILLING CYCLE, not per month. The flagship platform
// products bill WEEKLY, so "AIO Platform (1 to 5 Order Points)" at $99 is
// $99/week (~$429/mo). Never render a catalog price as monthly.
export type CatalogProduct = {
  hubspotProductId: string;
  name: string;
  price: number;
  billingFrequency: BillingFrequency;
  productType: string; // HubSpot hs_product_type: "inventory" | "Software" | "Service" | "AIO Payment Processing"
};

// A line on a quote. Price and frequency are SNAPSHOT at quote time rather than
// joined live from the catalog — HubSpot line items work the same way (they
// capture the product at time of sale and don't move when the catalog changes).
export type QuoteLine = {
  hubspotProductId: string;
  name: string;
  qty: number;
  unitPrice: number;
  billingFrequency: BillingFrequency;
  productType: string;
};

// Quote arithmetic, kept apart by billing cycle on purpose. `oneTime` and
// `recurring` are different units and must never be added together; the
// `monthlyEquivalent` is the only figure comparable to a statement's monthly
// numbers, and it covers the recurring side only.
export type QuoteTotals = {
  oneTime: number;
  recurring: Array<{ frequency: BillingFrequency; amount: number }>;
  monthlyEquivalent: number;
};

// The QUOTED ordering-point count — order-point-bearing hardware lines plus the
// non-hardware channels declared on the deal (a website is an ordering point
// and will never appear in an inventory system). It selects the platform tier,
// i.e. the largest recurring line on the quote, so it is part of what we
// quoted: frozen at publish alongside quoteConfig/quoteLines, never overwritten
// by a later sync. The DEPLOYED count is a separate, post-go-live thing that
// comes from aioinventory — don't conflate the two.
// `hardware` maps catalog product name → points that line contributed.
export type OrderPoints = {
  hardware: Record<string, number>;
  channels: string[];
  total: number;
};

// The rep-entered basis for a quote when there's no statement to read it from
// (E2E.md's "configs"). When an analysis exists its numbers win; this is also
// what Phase G compares trailing actuals against.
export type QuoteConfig = {
  avgTicket: number;
  monthlyVolume: number;
};

// HubSpot billing linkage. The quote is BOTH the rep-visible CRM artifact and
// the customer's checkout — see E2E-PLAN.md. We never create the subscription
// or its invoices; HubSpot does that when the customer pays the quote.
export type HubspotIds = {
  dealId: string | null;
  quoteId: string | null;
  quoteLink: string | null;      // hs_quote_link — public hosted quote URL (the port-out target)
  subscriptionId: string | null; // set only after HubSpot creates it from the checkout
  status: string | null;         // cached subscription hs_status snapshot
  statusAt: string | null;
};

export type BusinessInfo = {
  legalName: string;
  dba: string;
  bizType: "llc" | "corp" | "s-corp" | "sole-prop" | "partnership" | "non-profit";
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  website: string;
  yearsInBusiness: string;
  annualRevenue: string;
};

export type OwnerContact = {
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone: string;
};

export type ProcessingInfo = {
  monthlyVolume: string;
  avgTicket: string;
  cardPresentPct: string;
  mcc: string;
  businessDescription: string;
  previouslyTerminated: "yes" | "no";
  bankruptcy: "yes" | "no";
  currentProcessor: string;
};

export type AgreementInfo = {
  sigName: string;
  sigDate: string;
  termsAccepted: boolean;
  electronicConsentAccepted: boolean;
  // WHO performed this legal act. "customer" is the only value there is, because
  // the merchant is the only party who may consent on their own behalf — a rep
  // preparing the form has nothing it could write here. OPTIONAL because this is
  // a stored JSON column: rows written before the field existed carry no actor,
  // and an agreement whose origin can't be established is not the customer's.
  // See lib/consent.ts — the rule, and why absence must read as "not consent".
  actor?: "customer";
};

export type ProcessorTier = {
  id: string;
  name: string;
  isDefault: boolean;
  processingBps: number;
  perTxnFee: number;
  schemeBps: number;
  monthlyFee: number;
};

export type Processor = {
  id: string;
  name: string;
  isDefault: boolean;
  tiers: ProcessorTier[];
};

export type AppSettings = {
  processors: Processor[];
  adyenConfig?: {
    environment: "test" | "live";
    companyId: string;
    lemApiKey: string;
    managementApiKey: string;
    balancePlatformApiKey: string;
    corsProxy?: string;
  };
};

// Check's own read of how far a company got through payroll onboarding.
// "needs_attention" still allows payroll to run; "blocking" does not.
export type CheckOnboardStatus = "completed" | "needs_attention" | "blocking";

// Check (checkhq.com) payroll onboarding state — the payroll-side counterpart
// to adyenIds. We persist the company id and the signer, never the onboard
// link: Check links are one-time use and expire after 24h, so they're minted
// per click (same rule as Adyen's, just a longer fuse).
export type CheckIds = {
  companyId: string;
  environment: "sandbox" | "production";
  startDate: string;                          // first payday on Check (YYYY-MM-DD)
  signer: { name: string; title: string; email: string };
  createdAt: string;
  // Snapshot of Check's onboard status, refreshed when the customer views the
  // application detail page. Cached rather than fetched everywhere so the
  // dashboard/list views don't fan out one Check API call per application.
  onboardStatus: CheckOnboardStatus | null;
  onboardStatusAt: string | null;
};

export type MerchantApplication = {
  id: string;
  ownerUserId: string; // the rep who owns this deal — distinct from ownerContact (merchant's contact)
  customerUserId: string | null; // set once the customer completes magic-link signup
  createdAt: string;
  updatedAt: string;
  stage: DealStage;
  hubspotDealId: string | null;
  tenantLink: TenantLink | null; // Phase 3 — HubSpot Company (AIO tenant) this ezacc is linked to
  adyenIds: {
    legalEntityId: string | null;
    accountHolderId: string | null;
    balanceAccountId: string | null;
    merchantAccountId: string | null; // the shared POS merchant account the store lives under (e.g. AIOAppIncPOS)
    storeId: string | null;           // Adyen store id (ST…) — created only once the tenant number is known
    businessLineId: string | null;    // this restaurant's business line; links the store to the legal entity
    tenantNumber: string | null;      // AIO tenant number (from the AIO dashboard); drives the AH reference and store ref prod-{n}
    environment: "test" | "live";
  } | null;
  adyenOnboardingUrl: string | null;
  checkIds: CheckIds | null; // Check payroll onboarding — null until the customer opts in
  hubspotIds: HubspotIds | null; // HubSpot deal/quote/subscription — null until a quote is built
  quoteConfig: QuoteConfig | null; // rep-entered ticket/volume basis when there's no statement
  quoteLines: QuoteLine[] | null;  // hardware/platform/service lines; priced at quote time
  orderPoints: OrderPoints | null; // the quoted order-point count that selected the platform tier
  // When the customer explicitly accepted the quote on the customer quote view.
  // Distinct from stage: stage keeps moving through onboarding, this doesn't —
  // it's the moment the quote was agreed, and it belongs with the frozen
  // quoteConfig/quoteLines rather than with the live deal state.
  quoteAcceptedAt: string | null;
  targetMargin: number | null; // rep-set margin target, exists before any analysis
  pricingModel: PricingModel | null; // rep's pre-selected model for the prospect
  // Generalized token slot — serves both the pre-analysis self-serve upload
  // link (purpose "lead_upload") and the post-proposal Adyen KYC handoff
  // link (purpose "kyc_handoff"); these are different moments in the deal
  // lifecycle and can't share one unqualified token.
  customerLinkToken: string | null;
  customerLinkPurpose: "lead_upload" | "kyc_handoff" | null;
  customerLinkSentAt: string | null;
  customerLinkExpiresAt: string | null;
  analysis: StatementAnalysis | null;
  proposal: ProposalOutput | null;
  business: BusinessInfo | null;
  ownerContact: OwnerContact | null;
  processing: ProcessingInfo | null;
  agreement: AgreementInfo | null;
};

// Phase 3 — the "tenant ↔ ezacc equivalency". Links this easyob account
// (ezacc) to the HubSpot Company that represents the AIO tenant. HubSpot is
// the system of record for the AIO-dashboard-created Adyen objects (AIOad),
// so we snapshot the tenant's identifiers here at link time: it makes the
// link self-describing in the dashboard without a live HubSpot call on every
// render, and pre-captures exactly the AIOad identifiers the LATER
// "replace AIOad with ezad" work will need. Recording only — no Adyen call.
export type TenantLink = {
  hubspotCompanyId: string;
  companyName: string;
  tenantRef: string | null;             // HubSpot "tenant_id" value, e.g. "prod-1024" (store ref format)
  adyenAccountHolderId: string | null;  // AIOad account holder, e.g. "AH32..."
  linkedAt: string;
  linkedByUserId: string;
};

export type CustomerSubmission = {
  id: number;
  submittedAt: string;
  contactInfo: { dba: string; name: string; email: string; phone: string };
  analysis: StatementAnalysis;
  quote: {
    type: "quote" | "referral";
    flatRate?: number;
    monthlyCost?: number;
    annualCost?: number;
    savings?: { monthly: number; annual: number; pct: number };
  };
};

// The only shape a customer is ever allowed to see (enforced server-side at
// the API response boundary) — no cost breakdown, no margin, no raw analysis.
// The bar for adding a field here: would we print it on the quote we hand the
// merchant? Their own volume/ticket and the rate we're quoting pass; AIO's
// cost, margin, floor, or interchange assumptions do not.
// Phase C: quote lines and the order-point count are customer-safe — they are
// literally what's printed on the paper quote. Costs, margins and floors are
// not, and never join this shape.
export type CustomerSafeQuote = {
  // "statement" — read off the merchant's own statement (theirs or the rep's upload).
  // "config"    — derived from the rep-entered quoteConfig, no statement in hand.
  basis: "statement" | "config";
  monthlyVolume: number;
  averageTicket: number;
  effectiveRate: number;          // AIO's quoted all-in effective rate on that volume
  projectedMonthlyCost: number;
  projectedAnnualCost: number;
  // Savings need a CURRENT cost to compare against, and only a statement
  // supplies one. These are null on the config path on purpose — we quote a
  // rate there rather than invent what the merchant pays today.
  currentMonthlyCost: number | null;
  currentEffectiveRate: number | null;
  monthlySavings: number | null;
  annualSavings: number | null;
  savingsPct: number | null;
  // Hardware / platform / service lines as quoted, price and cycle snapshotted.
  // Empty (not null) when nothing was configured, so the view has one shape.
  lines: QuoteLine[];
  // Totals for those lines. Null when there are none. Never one number: the
  // one-time and recurring halves are different units.
  lineTotals: QuoteTotals | null;
  // Stated on the quote as the basis for the platform-fee line.
  orderPoints: OrderPoints | null;
};
