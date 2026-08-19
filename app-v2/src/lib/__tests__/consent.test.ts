import { describe, it, expect } from "vitest";
import { asCustomerConsent, isCustomerConsent } from "@/lib/consent";
import type { AgreementInfo } from "@/types/merchant";

// What the customer's own form writes today.
const CUSTOMER_CONSENT: AgreementInfo = {
  sigName: "Jane Doe", sigDate: "2026-08-19",
  termsAccepted: true, electronicConsentAccepted: true,
  actor: "customer",
};

// The shape the rep's Details step used to be able to persist, and the shape
// every agreement written before `actor` existed still has on the record.
const UNSTAMPED: AgreementInfo = {
  sigName: "Jane Doe", sigDate: "2026-08-19",
  termsAccepted: true, electronicConsentAccepted: true,
};

describe("isCustomerConsent", () => {
  it("accepts consent the merchant gave themselves", () => {
    expect(isCustomerConsent(CUSTOMER_CONSENT)).toBe(true);
  });

  it("finds no consent where there is no agreement", () => {
    expect(isCustomerConsent(null)).toBe(false);
    expect(isCustomerConsent(undefined)).toBe(false);
  });

  // THE LEGACY ROW. `agreement` is a stored JSON column, so rows written before
  // `actor` existed carry no provenance — including any a rep ticked on the
  // merchant's behalf. Unknown origin must mean "ask them", never "assume".
  it("does NOT treat an unstamped legacy agreement as customer consent", () => {
    expect(isCustomerConsent(UNSTAMPED)).toBe(false);
    expect(isCustomerConsent({ ...UNSTAMPED, actor: undefined })).toBe(false);
  });

  it("rejects an actor it doesn't recognise rather than trusting it", () => {
    // Not reachable through the type, but the column is JSON and old/foreign
    // writers aren't typechecked. Anything but "customer" is not the customer.
    for (const actor of ["rep", "admin", "", "CUSTOMER"]) {
      expect(isCustomerConsent({ ...UNSTAMPED, actor } as unknown as AgreementInfo)).toBe(false);
    }
  });

  it("still requires both consents, even from the merchant", () => {
    expect(isCustomerConsent({ ...CUSTOMER_CONSENT, termsAccepted: false })).toBe(false);
    expect(isCustomerConsent({ ...CUSTOMER_CONSENT, electronicConsentAccepted: false })).toBe(false);
  });

  it("does not accept a truthy non-boolean as a tick", () => {
    expect(isCustomerConsent({ ...CUSTOMER_CONSENT, termsAccepted: "yes" } as unknown as AgreementInfo)).toBe(false);
  });

  it("is not satisfied by a signature alone", () => {
    expect(isCustomerConsent({
      sigName: "Jane Doe", sigDate: "2026-08-19",
      termsAccepted: false, electronicConsentAccepted: false,
      actor: "customer",
    })).toBe(false);
  });
});

describe("asCustomerConsent", () => {
  it("stamps the merchant as the actor", () => {
    expect(asCustomerConsent(UNSTAMPED).actor).toBe("customer");
  });

  it("changes nothing else about the record", () => {
    expect(asCustomerConsent(UNSTAMPED)).toEqual({ ...UNSTAMPED, actor: "customer" });
  });

  it("does not mutate what it was given", () => {
    const before = { ...UNSTAMPED };
    asCustomerConsent(UNSTAMPED);
    expect(UNSTAMPED).toEqual(before);
    expect(UNSTAMPED.actor).toBeUndefined();
  });

  it("is what makes an agreement pass the rule", () => {
    expect(isCustomerConsent(UNSTAMPED)).toBe(false);
    expect(isCustomerConsent(asCustomerConsent(UNSTAMPED))).toBe(true);
  });

  // Stamping is not a way around the substance of consent: an unticked form
  // signed by the merchant is still not an agreement.
  it("cannot manufacture consent out of an unticked form", () => {
    const untouched: AgreementInfo = {
      sigName: "", sigDate: "", termsAccepted: false, electronicConsentAccepted: false,
    };
    expect(isCustomerConsent(asCustomerConsent(untouched))).toBe(false);
  });
});
