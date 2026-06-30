// Phase 2: Adyen LEM adapter
// Creates a minimal legal entity skeleton and returns Adyen's hosted onboarding URL.
// AIO never collects SSN, bank account, routing number, or EIN.

import type { MerchantApplication } from "@/types/merchant";

export interface AdyenOnboardResult {
  legalEntityId: string;
  onboardingUrl: string;
}

export async function createLegalEntityAndGetOnboardingUrl(
  app: MerchantApplication
): Promise<AdyenOnboardResult> {
  const apiKey  = process.env.ADYEN_LEM_API_KEY;
  const companyId = process.env.ADYEN_COMPANY_ID;
  const env     = process.env.ADYEN_ENVIRONMENT || "test";
  const baseUrl = env === "live"
    ? "https://balanceplatform-api-live.adyen.com/bcl/v3"
    : "https://balanceplatform-api-test.adyen.com/bcl/v3";

  if (!apiKey || !companyId) {
    throw new Error("ADYEN_LEM_API_KEY and ADYEN_COMPANY_ID are required (Phase 2)");
  }

  // Create minimal legal entity (AIO never fills sensitive fields — Adyen collects them)
  const entityRes = await fetch(`${baseUrl}/legalEntities`, {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "organization",
      organization: {
        legalName: app.business?.legalName || "Unknown",
        type: app.business?.bizType === "sole-prop" ? "soleProprietorship" : "limitedLiabilityCompany",
        registeredAddress: {
          street: app.business?.address,
          city: app.business?.city,
          stateOrProvince: app.business?.state,
          postalCode: app.business?.zip,
          country: "US",
        },
      },
    }),
  });
  if (!entityRes.ok) {
    const body = await entityRes.text();
    throw new Error(`Adyen legal entity creation failed: ${body}`);
  }
  const entity = await entityRes.json() as { id: string };

  // Get hosted onboarding URL
  const linkRes = await fetch(`${baseUrl}/legalEntities/${entity.id}/onboardingLinks`, {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      themeId: process.env.ADYEN_ONBOARDING_THEME_ID,
      redirectUrl: process.env.NEXT_PUBLIC_BASE_URL
        ? `${process.env.NEXT_PUBLIC_BASE_URL}/merchant/done`
        : undefined,
    }),
  });
  if (!linkRes.ok) {
    const body = await linkRes.text();
    throw new Error(`Adyen onboarding link failed: ${body}`);
  }
  const link = await linkRes.json() as { url: string };

  return { legalEntityId: entity.id, onboardingUrl: link.url };
}
