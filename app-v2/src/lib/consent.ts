// WHO MAY CREATE AN AGREEMENT.
//
// Only the merchant. Accepting the terms and consenting to electronic records
// are acts a person performs for themselves; a rep filling in the proposal
// wizard's Details step is PREPARING a form, not signing one. So the rep step
// captures no consent at all (components/rep/ApplyStep.tsx), and the customer's
// own onboarding form is the only place an agreement can originate.
//
// The rule needs a marker on the record, because a stored agreement is used for
// one more thing: the customer's form REPLAYS consent already given rather than
// demanding it twice (prefillMerge.recordedConsent). Replaying an agreement
// somebody else ticked would tell the merchant "you accepted the terms" about an
// act they never performed, and let them reach the Adyen KYC handoff without
// ever having consented. That is the failure this module exists to prevent.
//
// The marker fails safe by construction:
//   * `actor` has exactly one legal value, so no rep-side writer has anything it
//     could put there — the type itself refuses to record a non-merchant actor.
//   * `actor` is OPTIONAL, because `agreement` is a stored JSON column and rows
//     written before the field existed have none. Unknown origin is treated as
//     NOT the customer's, so those rows fall through to the fresh, unticked
//     form and the merchant is asked to consent. The cost is that a genuine
//     merchant consent recorded before this marker existed is asked for again;
//     that is the safe direction to be wrong in.
//
// Pure and dependency-free on purpose: this is the rule, not its plumbing.

import type { AgreementInfo } from "@/types/merchant";

/**
 * Is this consent the merchant's own, in full?
 *
 * Three things must hold, and a missing one is never assumed: the record must
 * exist, it must be stamped as the customer's, and both consents must be
 * present — a half-ticked agreement is not consent.
 *
 * Anything else — no agreement, an unstamped legacy row, a partial tick — is
 * false, which means "ask the merchant", never "assume they agreed".
 */
export function isCustomerConsent(
  agreement: AgreementInfo | null | undefined
): agreement is AgreementInfo {
  if (!agreement) return false;
  if (agreement.actor !== "customer") return false;
  return agreement.termsAccepted === true && agreement.electronicConsentAccepted === true;
}

/**
 * Stamp an agreement as the merchant's own act. The ONLY way an `actor` is ever
 * set, and it belongs exclusively to the customer's own submit path — calling it
 * anywhere a rep can reach would forge the provenance this module checks.
 */
export function asCustomerConsent(agreement: AgreementInfo): AgreementInfo {
  return { ...agreement, actor: "customer" };
}
