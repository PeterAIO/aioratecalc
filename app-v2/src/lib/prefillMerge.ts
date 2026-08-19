// Prefill MERGE rules — the half that hubspotPrefill.ts deliberately doesn't do.
//
// hubspotPrefill.ts maps HubSpot onto the app's shapes. This decides what
// happens when that mapping meets a form someone is already typing into (the
// rep's prospect form) or a record that was filled in for them (the customer's
// onboarding form). Pure and network-free for the same reason: it's the part
// with the rules worth testing, and it must stay out of the components.
//
// Nothing here may import @/lib/pricing — these run in client components.

import type { ProspectPrefill } from "@/lib/hubspotPrefill";
import type { AgreementInfo, BusinessInfo, MerchantApplication, OwnerContact, ProcessingInfo } from "@/types/merchant";
import { asCustomerConsent, isCustomerConsent } from "@/lib/consent";

/** Empty strings are how the app persists "nobody answered this" — never a value. */
function blank(v: string | null | undefined): boolean {
  return !(v ?? "").trim();
}

// ── Rep side: the prospect form ─────────────────────────────────────────────

/**
 * What the LAST prefill put on the form. Not the prefill itself — only the
 * values it actually wrote, so a later company switch knows exactly which
 * fields are still HubSpot's to replace and which the rep has taken over.
 */
export type AppliedProspectPrefill = {
  merchantName?: string;
  contactEmail?: string;
  channels: string[];
};

export const NO_PREFILL_APPLIED: AppliedProspectPrefill = { channels: [] };

export type ProspectFormValues = {
  merchantName: string;
  contactEmail: string;
  channels: string[];
};

/**
 * THE RULE: HubSpot owns a field until the rep types in it.
 *
 * A field is HubSpot's while it's blank or still holds exactly what the last
 * prefill wrote there. Once the rep changes it, it's theirs — a company switch
 * (or clearing the company) leaves it alone, and its "from HubSpot" hint goes
 * away because the value is no longer HubSpot's.
 */
function mergeText(
  current: string,
  appliedPrev: string | undefined,
  incoming: string | undefined
): { value: string; applied: string | undefined } {
  const repTyped = !blank(current) && current !== appliedPrev;
  if (repTyped) return { value: current, applied: undefined };
  return { value: incoming ?? "", applied: incoming };
}

/**
 * Fold a prefill into the form. `incoming: null` means the company was cleared
 * or couldn't be read — what HubSpot filled is withdrawn, what the rep typed
 * stays.
 *
 * Switching companies REPLACES rather than merges: the previous company's
 * values were recorded in `applied`, so they're overwritten (or cleared) rather
 * than left behind to blend with the new company's.
 */
export function mergeProspectPrefill(
  current: ProspectFormValues,
  applied: AppliedProspectPrefill,
  incoming: ProspectPrefill | null
): ProspectFormValues & { applied: AppliedProspectPrefill } {
  // HubSpot has no separate legal name, so the mapper seeds both from `name`;
  // this form has one "Business Name" field, so either will do.
  const name = mergeText(
    current.merchantName,
    applied.merchantName,
    incoming?.business.legalName ?? incoming?.business.dba
  );
  const email = mergeText(current.contactEmail, applied.contactEmail, incoming?.ownerContact.email);

  // Channels are checkboxes, so "typed in" means "ticked by the rep": anything
  // on the form that the last prefill didn't put there. Those survive; the rest
  // is replaced wholesale by the new company's channels. A channel that's both
  // rep-ticked and in the incoming set becomes the rep's, so a later switch
  // can't take it away.
  const repChosen = current.channels.filter(c => !applied.channels.includes(c));
  const incomingChannels = (incoming?.channels ?? []).filter(c => !repChosen.includes(c));

  return {
    merchantName: name.value,
    contactEmail: email.value,
    channels: [...repChosen, ...incomingChannels],
    applied: { merchantName: name.applied, contactEmail: email.applied, channels: incomingChannels },
  };
}

/** Is this form field currently showing exactly what HubSpot put there? */
export function isFromHubspot(
  applied: AppliedProspectPrefill,
  field: "merchantName" | "contactEmail",
  current: string
): boolean {
  const value = applied[field];
  return value !== undefined && current === value;
}

// The prefill reaches the application even when this form has no field for it
// (createProspectAction stamps it server-side), so the rep is told what's coming
// along rather than being left to assume only the two visible fields carried.
// Keyed in display order; first/last name collapse into one label.
const CARRYOVER_LABELS: Array<[string, string]> = [
  ["business.address", "street address"],
  ["business.city", "city"],
  ["business.state", "state"],
  ["business.zip", "ZIP"],
  ["business.phone", "business phone"],
  ["business.website", "website"],
  ["ownerContact.firstName", "owner name"],
  ["ownerContact.lastName", "owner name"],
  ["ownerContact.title", "owner title"],
  ["ownerContact.phone", "owner phone"],
  ["processing.currentProcessor", "current processor"],
  ["processing.businessDescription", "business description"],
];

/**
 * Human labels for everything in `fromHubspot` that ISN'T already a visible
 * field on the prospect form. Unknown paths are dropped rather than guessed at
 * — a label nobody wrote is not a label worth showing.
 */
export function prefillCarryoverLabels(fromHubspot: string[]): string[] {
  const have = new Set(fromHubspot);
  const out: string[] = [];
  for (const [path, label] of CARRYOVER_LABELS) {
    if (have.has(path) && !out.includes(label)) out.push(label);
  }
  return out;
}

// ── Customer side: the onboarding form ──────────────────────────────────────

type Sections = { business: BusinessInfo; ownerContact: OwnerContact; processing: ProcessingInfo };

/** The three form sections as dotted paths → values, e.g. `business.city`. */
export function flattenSections(s: Sections): Record<string, string> {
  const out: Record<string, string> = {};
  // The three sections by name rather than Object.entries(s): callers pass the
  // whole CustomerOnboardInitial, which carries `prefilled` too.
  for (const section of ["business", "ownerContact", "processing"] as const) {
    for (const [key, value] of Object.entries(s[section] as Record<string, string>)) {
      out[`${section}.${key}`] = value;
    }
  }
  return out;
}

// A form default is not a prefill. These are what the form would have shown
// anyway, so marking them "pre-filled" would tell the customer to double-check
// something nobody asserted.
const FORM_DEFAULTS: Record<string, string> = {
  "business.bizType": "llc",
  "ownerContact.title": "Owner",
  "processing.previouslyTerminated": "no",
  "processing.bankruptcy": "no",
};

export type CustomerOnboardInitial = Sections & {
  /** Dotted paths that arrived already filled in, for the "pre-filled" hint. */
  prefilled: string[];
};

/**
 * The customer's starting point: whatever the rep entered, HubSpot supplied at
 * prospect creation, or their own statement revealed — so their job is to
 * confirm rather than retype.
 *
 * Empty strings count as NOT filled: the app persists whole `business` records
 * with blank fields, and a blank that claims to be prefilled is a phantom.
 *
 * `agreement` is deliberately absent. Consent is never PREFILLED — see
 * recordedConsent below for the separate, explicit handling of consent that
 * was already given.
 */
export function customerOnboardInitial(
  app: Pick<MerchantApplication, "analysis" | "business" | "ownerContact" | "processing">
): CustomerOnboardInitial {
  const a = app.analysis;

  const business: BusinessInfo = {
    legalName: a?.merchantName || "", dba: a?.merchantName || "",
    bizType: "llc", address: "", city: "", state: "", zip: "",
    phone: "", website: "", yearsInBusiness: "", annualRevenue: "",
    ...compact(app.business),
  };
  const ownerContact: OwnerContact = {
    firstName: "", lastName: "", title: "Owner", email: "", phone: "",
    ...compact(app.ownerContact),
  };
  const processing: ProcessingInfo = {
    monthlyVolume: a?.totalVolume ? String(Math.round(a.totalVolume)) : "",
    avgTicket: a?.averageTicket ? String(Math.round(a.averageTicket)) : "",
    cardPresentPct: a?.cardPresentPct ? String(Math.round(a.cardPresentPct * 100)) : "",
    mcc: "", businessDescription: "", previouslyTerminated: "no", bankruptcy: "no",
    currentProcessor: a?.currentProcessorName || "",
    ...compact(app.processing),
  };

  const prefilled = Object.entries(flattenSections({ business, ownerContact, processing }))
    .filter(([path, value]) => !blank(value) && value !== FORM_DEFAULTS[path])
    .map(([path]) => path);

  return { business, ownerContact, processing, prefilled };
}

// ── Customer side: consent already on record ────────────────────────────────
//
// Two different things share the word "prefill" here, and only one of them is
// ever allowed for consent:
//
//   PREFILLING consent — putting a tick in a box nobody ticked — is never OK.
//   customerOnboardInitial has no `agreement` section for exactly that reason.
//
//   REPLAYING recorded consent — showing a customer who already consented that
//   they did, on the edit they came back to make — is a statement of fact, and
//   making them re-consent to fix a typo both adds work and misrepresents the
//   record.

export type RecordedConsent = {
  /**
   * The stored agreement, replayed verbatim. The submit gate still requires
   * both booleans; this satisfies it from the record instead of weakening it.
   */
  agreement: AgreementInfo;
  /** When consent was given, or null when the record carries no usable date. */
  dateLabel: string | null;
};

/**
 * Is there consent on record? Both booleans must be true — a half-ticked
 * agreement is not consent, and falls back to the fresh, unticked form.
 */
export function recordedConsent(agreement: AgreementInfo | null | undefined): RecordedConsent | null {
  // Only the merchant can consent, and only both-ticked consent counts. An
  // agreement with no recorded actor — every row written before `actor`
  // existed, including any a rep ticked — is NOT replayable: see lib/consent.ts.
  if (!isCustomerConsent(agreement)) return null;
  return { agreement, dateLabel: consentDateLabel(agreement.sigDate) };
}

/**
 * "August 19, 2026", or null when the stored date is missing or unparseable —
 * a date we can't read must degrade to "consent is on file" rather than become
 * "Invalid Date" or a date nobody recorded. Locale and time zone are pinned so
 * the server render and the client hydration produce the same string.
 */
function consentDateLabel(sigDate: string | null | undefined): string | null {
  const raw = (sigDate ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });
}

/** Today, in the YYYY-MM-DD form consent dates are stored in. */
function consentDateNow(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * THE RULE: the recorded consent date is a fact about when consent was given,
 * so an edit must not silently rewrite it.
 *
 * Untouched recorded consent goes back exactly as it came. A fresh consent, or
 * a recorded one the customer reopened and changed, is consent given now — and
 * gets today's date.
 */
export function agreementToSubmit(
  recorded: RecordedConsent | null,
  form: AgreementInfo,
  consentTouched: boolean,
  today: string = consentDateNow()
): AgreementInfo {
  if (recorded && !consentTouched) return recorded.agreement;
  // Consent given here, now, by the merchant themselves — the only party who
  // may. The replay branch above needs no stamp: recordedConsent only returns
  // agreements that already carry one.
  return asCustomerConsent({ ...form, sigDate: today });
}

/** Drops blank fields so a persisted record can't overwrite a real value with "". */
function compact<T extends object>(record: T | null | undefined): Partial<T> {
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record).filter(([, v]) => typeof v !== "string" || !blank(v))
  ) as Partial<T>;
}
