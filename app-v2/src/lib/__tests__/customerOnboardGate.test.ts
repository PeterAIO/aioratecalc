import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MerchantApplication, BusinessInfo, OwnerContact, ProcessingInfo, AgreementInfo } from "@/types/merchant";

// saveMyApplicationOnboardingAction is a Server Action; its collaborators are
// stubbed the same way customerQuote.test.ts stubs them. What's under test is
// the gate: whether Adyen is called at all, and what the form is told when it
// isn't. Same mock set as that file — the module graph is shared.
const auth = vi.fn();
const getApplicationForCustomer = vi.fn();
const updateApplicationAsCustomer = vi.fn();
const createLegalEntityAndGetOnboardingUrl = vi.fn();
const pushToHubSpot = vi.fn();

vi.mock("@/lib/auth", () => ({ auth, signIn: vi.fn() }));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/storage/postgresAdapter", () => ({
  postgresStorage: { getApplicationForCustomer, updateApplicationAsCustomer },
}));
vi.mock("@/lib/adapters/email", () => ({ sendMagicLinkEmail: vi.fn() }));
vi.mock("@/lib/adapters/adyen", () => ({
  createLegalEntityAndGetOnboardingUrl, updateLegalEntity: vi.fn(),
}));
vi.mock("@/lib/adapters/check", () => ({
  checkEnvironment: vi.fn(), createCheckCompany: vi.fn(),
  createCheckOnboardLink: vi.fn(), getCheckOnboardStatus: vi.fn(),
}));
vi.mock("@/lib/adapters/hubspot", () => ({ pushToHubSpot }));

const { saveMyApplicationOnboardingAction } = await import("@/lib/actions/customer");

const CUSTOMER_SESSION = { user: { id: "cust-1", role: "customer" } };

const BUSINESS: BusinessInfo = {
  legalName: "Torta Palace LLC", dba: "Torta Palace", bizType: "llc",
  address: "1200 Wilshire Blvd", city: "Los Angeles", state: "CA", zip: "90017",
  phone: "555-000-0000", website: "tortapalace.com", yearsInBusiness: "5", annualRevenue: "1200000",
};
const OWNER: OwnerContact = {
  firstName: "Ana", lastName: "Reyes", title: "Owner",
  email: "ana@tortapalace.com", phone: "555-000-0001",
};
const PROCESSING: ProcessingInfo = {
  monthlyVolume: "100000", avgTicket: "45", cardPresentPct: "80", mcc: "5812",
  businessDescription: "Taqueria", previouslyTerminated: "no", bankruptcy: "no",
  currentProcessor: "Stripe",
};
const AGREEMENT: AgreementInfo = {
  sigName: "Ana Reyes", sigDate: "2026-08-19",
  termsAccepted: true, electronicConsentAccepted: true, actor: "customer",
};

const fields = (biz: Partial<BusinessInfo> = {}) => ({
  business: { ...BUSINESS, ...biz },
  ownerContact: OWNER,
  processing: PROCESSING,
  agreement: AGREEMENT,
});

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const m of [auth, getApplicationForCustomer, updateApplicationAsCustomer,
                   createLegalEntityAndGetOnboardingUrl, pushToHubSpot]) m.mockReset();
  auth.mockResolvedValue(CUSTOMER_SESSION);
  getApplicationForCustomer.mockResolvedValue({ id: "app-1" } as MerchantApplication);
  // The action re-reads the row it just wrote, so the stub echoes the patch back.
  updateApplicationAsCustomer.mockImplementation(async (_u: string, id: string, patch: object) =>
    ({ id, ...patch }) as MerchantApplication);
  pushToHubSpot.mockRejectedValue(new Error("HUBSPOT_PRIVATE_APP_TOKEN not set"));
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => errorSpy.mockRestore());

describe("saveMyApplicationOnboardingAction — validation gates Adyen", () => {
  it("never calls Adyen when a required field is missing", async () => {
    const result = await saveMyApplicationOnboardingAction("app-1", fields({ zip: "" }));

    expect(createLegalEntityAndGetOnboardingUrl).not.toHaveBeenCalled();
    expect(result.fieldErrors).toEqual({ "business.zip": expect.any(String) });
    expect(result.adyenReady).toBe(false);
    expect(result.adyenFailed).toBe(false);
  });

  it("never calls Adyen for a present-but-malformed value", async () => {
    const result = await saveMyApplicationOnboardingAction("app-1", fields({ state: "Kalifornia" }));

    expect(createLegalEntityAndGetOnboardingUrl).not.toHaveBeenCalled();
    expect(result.fieldErrors).toEqual({ "business.state": expect.any(String) });
  });

  // THE ONE THAT MATTERS. A rejected submission must not cost the customer
  // everything they typed — that would be a worse bug than the dead end.
  it("still saves the customer's input when validation fails", async () => {
    await saveMyApplicationOnboardingAction("app-1", fields({ zip: "", legalName: "Torta Palace LLC" }));

    expect(updateApplicationAsCustomer).toHaveBeenCalledTimes(1);
    const [userId, id, patch] = updateApplicationAsCustomer.mock.calls[0];
    expect([userId, id]).toEqual(["cust-1", "app-1"]);
    expect(patch.business.legalName).toBe("Torta Palace LLC");
    expect(patch.business.zip).toBe("");
    expect(patch.ownerContact).toEqual(OWNER);
    expect(patch.processing).toEqual(PROCESSING);
    expect(patch.agreement).toEqual(AGREEMENT);
  });

  it("does not advance the stage when onboarding never started", async () => {
    await saveMyApplicationOnboardingAction("app-1", fields({ zip: "" }));
    expect(updateApplicationAsCustomer.mock.calls[0][2]).not.toHaveProperty("stage");
  });
});

describe("saveMyApplicationOnboardingAction — the three outcomes", () => {
  it("reports success with the onboarding URL when Adyen accepts", async () => {
    createLegalEntityAndGetOnboardingUrl.mockResolvedValue({
      legalEntityId: "LE1", accountHolderId: "AH1", balanceAccountId: "BA1",
      businessLineId: "BL1", onboardingUrl: "https://kyc-test.adyen.com/uo/abc",
    });

    const result = await saveMyApplicationOnboardingAction("app-1", fields());

    expect(result.fieldErrors).toBeNull();
    expect(result.adyenReady).toBe(true);
    expect(result.adyenFailed).toBe(false);
    expect(result.app.adyenOnboardingUrl).toBe("https://kyc-test.adyen.com/uo/abc");
    expect(updateApplicationAsCustomer.mock.calls[0][2].stage).toBe("merchant_filling");
    expect(updateApplicationAsCustomer.mock.calls[1][2].stage).toBe("adyen_kyc_pending");
  });

  it("reports an Adyen failure as a failure, not as a submitted application", async () => {
    createLegalEntityAndGetOnboardingUrl.mockRejectedValue(
      new Error("Adyen legal entity creation failed (401): Unauthorized")
    );

    const result = await saveMyApplicationOnboardingAction("app-1", fields());

    expect(result.adyenReady).toBe(false);
    expect(result.adyenFailed).toBe(true);
    expect(result.fieldErrors).toBeNull(); // not the customer's to fix
    // The log is the only trace of a credentials/outage failure — keep it.
    expect(errorSpy).toHaveBeenCalledWith(
      "Adyen onboarding failed:", "Adyen legal entity creation failed (401): Unauthorized"
    );
  });

  it("treats a created entity with no link back as a failure too", async () => {
    // The old dead end: adyenReady was true while adyenOnboardingUrl was empty,
    // so the form rendered a success screen with nothing to click.
    createLegalEntityAndGetOnboardingUrl.mockResolvedValue({
      legalEntityId: "LE1", accountHolderId: "AH1", balanceAccountId: "BA1",
      businessLineId: "BL1", onboardingUrl: "",
    });

    const result = await saveMyApplicationOnboardingAction("app-1", fields());

    expect(result.adyenReady).toBe(false);
    expect(result.adyenFailed).toBe(true);
  });
});
