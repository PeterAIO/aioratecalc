// Phase 2: Adyen for Platforms hosted onboarding adapter.
// Builds the object graph Adyen needs, then returns a hosted onboarding URL:
//   legal entity (LEM) → account holder + capabilities (Config) →
//   business line (LEM) → balance account (Config) → onboarding link (LEM)
// AIO never collects SSN, bank account, routing number, or EIN — Adyen collects
// those on its hosted page. Calls span two APIs / hosts / credentials:
//   LEM API    → kyc-*.adyen.com/lem/v3           (ADYEN_LEM_API_KEY)
//   Config API → balanceplatform-api-*/bcl/v2     (ADYEN_CONFIG_API_KEY)

import type { MerchantApplication } from "@/types/merchant";

export interface AdyenOnboardResult {
  legalEntityId: string;
  accountHolderId: string;
  balanceAccountId: string;
  businessLineId: string;
  onboardingUrl: string;
}

function bases(env: string) {
  const live = env === "live";
  return {
    lem: live ? "https://kyc-live.adyen.com/lem/v3" : "https://kyc-test.adyen.com/lem/v3",
    bcl: live
      ? "https://balanceplatform-api-live.adyen.com/bcl/v2"
      : "https://balanceplatform-api-test.adyen.com/bcl/v2",
    // Management API — stores / merchant accounts (Phase A acceptance side).
    mgmt: live ? "https://management-live.adyen.com/v3" : "https://management-test.adyen.com/v3",
  };
}

// Single fetch helper — Adyen auth is X-API-Key on every call. Throws with the
// step label + status + response body so failures are self-describing.
async function adyenCall(
  url: string,
  apiKey: string,
  body: unknown,
  label: string,
  method: "POST" | "PATCH" = "POST"
): Promise<any> {
  const res = await fetch(url, {
    method,
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Adyen ${label} failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// Adyen requires the 2-letter USPS code for US stateOrProvince and 422s on the
// full name — merchants routinely type "California", so normalize best-effort.
const US_STATE_CODES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
  "district of columbia": "DC", "puerto rico": "PR",
};

function usStateCode(state: string | undefined): string | undefined {
  if (!state) return undefined;
  const s = state.trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return US_STATE_CODES[s.toLowerCase().replace(/\s+/g, " ")] ?? s;
}

// Maps our bizType to Adyen LEM organization.type values.
// NOTE: sole proprietorships are really a distinct legalEntity type
// ("soleProprietorship"), not an organization — mapping it to privateCompany
// here is a stopgap so it validates; proper sole-prop support is a Phase 2 TODO.
function adyenOrgType(bizType: string | undefined): string {
  switch (bizType) {
    case "partnership": return "partnershipIncorporated";
    case "non-profit":  return "nonProfit";
    case "llc":
    case "corp":
    case "s-corp":
    case "sole-prop":
    default:            return "privateCompany";
  }
}

export async function createLegalEntityAndGetOnboardingUrl(
  app: MerchantApplication
): Promise<AdyenOnboardResult> {
  const lemKey    = process.env.ADYEN_LEM_API_KEY;
  const configKey = process.env.ADYEN_CONFIG_API_KEY;
  const env       = process.env.ADYEN_ENVIRONMENT || "test";
  if (!lemKey)    throw new Error("ADYEN_LEM_API_KEY is required (Phase 2)");
  if (!configKey) throw new Error("ADYEN_CONFIG_API_KEY is required (Phase 2)");
  const { lem, bcl } = bases(env);

  const legalName = app.business?.legalName || "Unknown";
  // Human-readable name for the Adyen object descriptions (what shows in the
  // Customer Area account-holder / store lists). Matches AIO's convention of the
  // restaurant's trading name rather than an "AIO merchant —" prefix.
  const displayName = app.business?.dba || legalName;
  const registeredAddress = {
    street: app.business?.address,
    city: app.business?.city,
    stateOrProvince: usStateCode(app.business?.state),
    postalCode: app.business?.zip,
    country: "US",
  };

  // 1. Legal entity (LEM). AIO never fills sensitive fields — Adyen collects them.
  const entity = await adyenCall(`${lem}/legalEntities`, lemKey, {
    type: "organization",
    organization: { legalName, type: adyenOrgType(app.business?.bizType), registeredAddress },
  }, "legal entity creation");

  // 2. Account holder + capabilities (Config API). Capabilities MUST be requested
  //    here — this is what makes the onboarding link (step 5) valid. Only "requested"
  //    is settable on create; enabled/allowed are read-only (Adyen sets after KYC).
  //    Split model: AIO's platform is the merchant of record and processes payments;
  //    each sub-merchant RECEIVES its split (receiveFromPlatformPayments) and pays out
  //    to its own bank (sendToTransferInstrument). A sub-merchant does NOT process
  //    directly, so it does not request receivePayments.
  const accountHolder = await adyenCall(`${bcl}/accountHolders`, configKey, {
    legalEntityId: entity.id,
    description: displayName,
    // Fallback reference until the AIO tenant number is known — setTenantNumberAction
    // PATCHes this to the tenant number later (AH reference is mutable). The webhook
    // links back by legalEntityId, not this reference, so app.id here is safe.
    reference: app.id,
    capabilities: {
      receiveFromPlatformPayments: { requested: true },
      sendToTransferInstrument:    { requested: true },
    },
  }, "account holder creation");

  // 3. Business line (LEM). Describes what the merchant sells.
  //    - salesChannels: eCommerce only when a website exists (Adyen requires
  //      webData/webAddress for the eCommerce channel), plus pos when the merchant
  //      takes any card-present volume. Always at least one channel.
  //    - industryCode: this is NOT the merchant's MCC — Adyen uses its own enumerated
  //      industry-code list (a raw MCC like "5812" 422s with "not recognised"). Left
  //      as Adyen's retail example until we add an MCC→Adyen-industry-code mapping
  //      from Adyen's reference list (go-live TODO). The merchant's real MCC is
  //      collected in processing.mcc and is ready to map when that lands.
  // Adyen requires webAddress to be a full URL (http:// or https://). Merchants
  // routinely enter a bare domain ("aioapp.com"), which 422s, so normalize here.
  const rawWebsite = app.business?.website?.trim();
  const website = rawWebsite
    ? (/^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`)
    : undefined;
  const cpPct = Number(app.processing?.cardPresentPct);
  const salesChannels: string[] = [];
  if (website) salesChannels.push("eCommerce");
  if (Number.isNaN(cpPct) ? !website : cpPct > 0) salesChannels.push("pos");
  if (salesChannels.length === 0) salesChannels.push("pos");
  const businessLine = await adyenCall(`${lem}/businessLines`, lemKey, {
    legalEntityId: entity.id,
    service: "paymentProcessing",
    industryCode: "4431A",
    salesChannels,
    ...(website ? { webData: [{ webAddress: website }] } : {}),
  }, "business line creation");

  // 4. Balance account (Config API) — where the merchant's funds settle.
  const balanceAccount = await adyenCall(`${bcl}/balanceAccounts`, configKey, {
    accountHolderId: accountHolder.id,
    description: `${displayName} — primary`,
    defaultCurrencyCode: "USD",
  }, "balance account creation");

  // 5. Hosted onboarding link (LEM). Expires ~4 min and is single-use — generate on demand.
  const onboardingUrl = await createOnboardingLink(entity.id, app.id);

  return {
    legalEntityId: entity.id,
    accountHolderId: accountHolder.id,
    balanceAccountId: balanceAccount.id,
    businessLineId: businessLine.id,
    onboardingUrl,
  };
}

// Mints a FRESH hosted onboarding link for an already-created legal entity.
// These links expire in ~4 min and are single-use, so we regenerate one per
// visit rather than persisting and re-serving a stale one — a dead link sends
// the merchant to Adyen's /uo/error/startup-failed page. Callable on its own
// so "Continue Verification" can hand the merchant a live link every time.
export async function createOnboardingLink(legalEntityId: string, appId: string): Promise<string> {
  const lemKey = process.env.ADYEN_LEM_API_KEY;
  const env    = process.env.ADYEN_ENVIRONMENT || "test";
  if (!lemKey) throw new Error("ADYEN_LEM_API_KEY is required (Phase 2)");
  const { lem } = bases(env);

  const link = await adyenCall(`${lem}/legalEntities/${legalEntityId}/onboardingLinks`, lemKey, {
    themeId: process.env.ADYEN_ONBOARDING_THEME_ID || undefined,
    redirectUrl: process.env.NEXT_PUBLIC_BASE_URL
      ? `${process.env.NEXT_PUBLIC_BASE_URL}/customer/applications/${appId}/done`
      : undefined,
  }, "onboarding link");
  return link.url;
}

// Phase 2: pushes an edited business record to an already-created legal
// entity. Only business fields are sent, matching create's scope above —
// owner/individual data still isn't sent to Adyen anywhere in this adapter.
export async function updateLegalEntity(legalEntityId: string, app: MerchantApplication): Promise<void> {
  const lemKey = process.env.ADYEN_LEM_API_KEY;
  const env    = process.env.ADYEN_ENVIRONMENT || "test";
  if (!lemKey) throw new Error("ADYEN_LEM_API_KEY is required (Phase 2)");
  const { lem } = bases(env);

  await adyenCall(`${lem}/legalEntities/${legalEntityId}`, lemKey, {
    organization: {
      legalName: app.business?.legalName || "Unknown",
      registeredAddress: {
        street: app.business?.address,
        city: app.business?.city,
        stateOrProvince: usStateCode(app.business?.state),
        postalCode: app.business?.zip,
        country: "US",
      },
    },
  }, "legal entity update", "PATCH");
}

// Creates a store (the prod-{tenant} object terminals attach to) under AIO's
// shared POS merchant account, linked to this restaurant's business line and
// balance account. Adyen requires a full address, an E.164 phone, and a
// shopperStatement (≤22 chars, not all-numeric) that shows on the cardholder's
// statement. Returns the Adyen store id (ST…).
async function createStore(
  mgmtKey: string,
  merchantId: string,
  storeReference: string,
  splitConfigurationId: string,
  app: MerchantApplication,
  opts: { businessLineId: string; balanceAccountId: string | null; environment: "test" | "live" }
): Promise<string> {
  const { mgmt } = bases(opts.environment);
  const displayName = app.business?.dba || app.business?.legalName || "AIO Merchant";
  const shopperStatement = (displayName.replace(/[^a-zA-Z0-9 ]/g, "").trim().slice(0, 22)) || "AIO Merchant";
  const store = await adyenCall(`${mgmt}/merchants/${merchantId}/stores`, mgmtKey, {
    description: displayName,
    reference: storeReference,
    shopperStatement,
    phoneNumber: app.business?.phone,
    address: {
      country: "US",
      line1: app.business?.address,
      city: app.business?.city,
      postalCode: app.business?.zip,
      stateOrProvince: usStateCode(app.business?.state),
    },
    businessLineIds: [opts.businessLineId],
    ...(opts.balanceAccountId
      ? { splitConfiguration: { splitConfigurationId, balanceAccountId: opts.balanceAccountId } }
      : {}),
  }, "store creation");
  return store.id;
}

export interface ApplyTenantResult {
  storeId: string | null;
  merchantAccountId: string | null;
  storeCreated: boolean;
}

// Applies an AIO tenant number to an already-onboarded account:
//   1. PATCHes the account-holder reference to the tenant number (mutable), so
//      the account holder matches AIO's Customer Area convention.
//   2. Creates the prod-{tenant} store IF the POS config is present and no store
//      exists yet. If the config is absent, it degrades to handoff mode (no store)
//      — the OB team creates the store from the export. A store reference can't be
//      changed later, so we only ever create it once, with the correct name.
export async function applyTenantNumber(
  adyenIds: NonNullable<MerchantApplication["adyenIds"]>,
  tenantNumber: string,
  app: MerchantApplication
): Promise<ApplyTenantResult> {
  const configKey = process.env.ADYEN_CONFIG_API_KEY;
  if (!configKey) throw new Error("ADYEN_CONFIG_API_KEY is required");
  const { bcl } = bases(adyenIds.environment);

  if (adyenIds.accountHolderId) {
    await adyenCall(`${bcl}/accountHolders/${adyenIds.accountHolderId}`, configKey,
      { reference: tenantNumber }, "account holder tenant reference", "PATCH");
  }

  // Store already made — never recreate (its reference is immutable).
  if (adyenIds.storeId) {
    return { storeId: adyenIds.storeId, merchantAccountId: adyenIds.merchantAccountId, storeCreated: false };
  }

  const merchantId = process.env.ADYEN_POS_MERCHANT_ACCOUNT;
  const mgmtKey = process.env.ADYEN_MANAGEMENT_API_KEY;
  const splitConfigurationId = process.env.ADYEN_SPLIT_CONFIGURATION_ID;
  if (!merchantId || !mgmtKey || !splitConfigurationId) {
    // Hybrid degrade: POS config not set — skip the store, hand off to the OB team.
    return { storeId: null, merchantAccountId: null, storeCreated: false };
  }
  if (!adyenIds.businessLineId) {
    throw new Error("This account predates business-line capture — the OB team must create its store manually");
  }

  const storeId = await createStore(mgmtKey, merchantId, `prod-${tenantNumber}`, splitConfigurationId, app, {
    businessLineId: adyenIds.businessLineId,
    balanceAccountId: adyenIds.balanceAccountId,
    environment: adyenIds.environment,
  });
  return { storeId, merchantAccountId: merchantId, storeCreated: true };
}
