export type PricingModel = "flat-rate" | "2-tier" | "interchange-plus";

export type DealStage =
  | "prospect_created"      // rep created a prospect + set a margin target, no link sent yet
  | "lead_link_sent"        // rep sent the tokenized self-serve upload link, awaiting customer
  | "lead_analysis_pending" // customer clicked the link and uploaded a statement, analyzing
  | "analysis"
  | "pricing"
  | "proposal_ready"
  | "proposal_sent"
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

export type MerchantApplication = {
  id: string;
  ownerUserId: string; // the rep who owns this deal — distinct from ownerContact (merchant's contact)
  customerUserId: string | null; // set once the customer completes magic-link signup
  createdAt: string;
  updatedAt: string;
  stage: DealStage;
  hubspotDealId: string | null;
  adyenIds: {
    legalEntityId: string | null;
    merchantAccountId: string | null;
    environment: "test" | "live";
  } | null;
  adyenOnboardingUrl: string | null;
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
export type CustomerSafeQuote = {
  effectiveRate: number;
  monthlySavings: number;
  annualSavings: number;
  savingsPct: number;
};
