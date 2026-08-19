import type { MerchantApplication } from "@/types/merchant";

// merchant_applications has ONE customer-link slot (customerLinkToken +
// customerLinkPurpose), deliberately shared by the two moments a customer gets
// a URL. That generalization is fine, but writing the slot is destructive: the
// previous token is gone the moment a new one lands, and every reader gates on
// an exact `customerLinkPurpose` match, so the merchant's old URL starts
// returning "Invalid link" with nothing to explain why.
//
// The rule that keeps that from happening:
//
//   - The `kyc_handoff` side does not write the slot at all. Its real, live URL
//     is a customer_login_tokens row (/api/customer/verify?token=…) — a
//     separate, single-use mechanism that already exists. The slot write was
//     bookkeeping no reader ever consumed, whose only observable effect was
//     destroying a live quote link. See sendMerchantOnboardingLinkAction.
//   - The `lead_upload` side reuses a still-live token rather than minting over
//     it, so re-issuing a quote link can never invalidate the one the merchant
//     is already holding. See resolveLeadLinkIssue.
//
// Net: the slot only ever holds a lead_upload token, and that token's only way
// to stop working is natural expiry — which /lead/[token] explains.

/** The slot fields any decision here reads. */
export type CustomerLinkSlot = Pick<
  MerchantApplication,
  "customerLinkToken" | "customerLinkPurpose" | "customerLinkExpiresAt"
>;

export type LeadLinkDecision =
  | { reuse: true; token: string }
  | { reuse: false };

/**
 * Whether issuing a customer quote link should keep the token already in the
 * slot (and just push its expiry out) or mint a fresh one.
 *
 * Reuse requires a token that is present, already `lead_upload`, and unexpired.
 * A `kyc_handoff` value is never reused — it would fail the purpose gate on
 * /lead/[token] — but replacing one is harmless: no URL was ever built from it.
 *
 * Expiry matches the lead routes' own semantics exactly: a null or unparseable
 * customerLinkExpiresAt counts as live, since `NaN < now` is false there too.
 */
export function resolveLeadLinkIssue(slot: CustomerLinkSlot, nowMs: number): LeadLinkDecision {
  const { customerLinkToken: token, customerLinkPurpose: purpose } = slot;
  if (!token || purpose !== "lead_upload") return { reuse: false };

  if (slot.customerLinkExpiresAt) {
    const expiresAt = Date.parse(slot.customerLinkExpiresAt);
    if (Number.isFinite(expiresAt) && expiresAt < nowMs) return { reuse: false };
  }
  return { reuse: true, token };
}
