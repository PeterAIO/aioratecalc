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
  onboardingUrl: string;
}

function bases(env: string) {
  const live = env === "live";
  return {
    lem: live ? "https://kyc-live.adyen.com/lem/v3" : "https://kyc-test.adyen.com/lem/v3",
    bcl: live
      ? "https://balanceplatform-api-live.adyen.com/bcl/v2"
      : "https://balanceplatform-api-test.adyen.com/bcl/v2",
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
  const registeredAddress = {
    street: app.business?.address,
    city: app.business?.city,
    stateOrProvince: app.business?.state,
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
    description: `AIO merchant — ${legalName}`,
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
  await adyenCall(`${lem}/businessLines`, lemKey, {
    legalEntityId: entity.id,
    service: "paymentProcessing",
    industryCode: "4431A",
    salesChannels,
    ...(website ? { webData: [{ webAddress: website }] } : {}),
  }, "business line creation");

  // 4. Balance account (Config API) — where the merchant's funds settle.
  const balanceAccount = await adyenCall(`${bcl}/balanceAccounts`, configKey, {
    accountHolderId: accountHolder.id,
    description: `${legalName} — primary`,
    defaultCurrencyCode: "USD",
  }, "balance account creation");

  // 5. Hosted onboarding link (LEM). Expires ~4 min and is single-use — generate on demand.
  const link = await adyenCall(`${lem}/legalEntities/${entity.id}/onboardingLinks`, lemKey, {
    themeId: process.env.ADYEN_ONBOARDING_THEME_ID || undefined,
    redirectUrl: process.env.NEXT_PUBLIC_BASE_URL
      ? `${process.env.NEXT_PUBLIC_BASE_URL}/customer/applications/${app.id}/done`
      : undefined,
  }, "onboarding link");

  return {
    legalEntityId: entity.id,
    accountHolderId: accountHolder.id,
    balanceAccountId: balanceAccount.id,
    onboardingUrl: link.url,
  };
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
        stateOrProvince: app.business?.state,
        postalCode: app.business?.zip,
        country: "US",
      },
    },
  }, "legal entity update", "PATCH");
}
