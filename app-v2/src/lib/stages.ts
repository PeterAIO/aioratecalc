// Canonical stage ordering for MerchantApplication.stage, and the dashboard
// stage-group buckets derived from it. Single source of truth: STAGE_RANK
// used to live duplicated as a hand-copied array in three dashboard files
// (AdminDashboard.tsx, AccountsDashboard.tsx, admin/users/page.tsx) plus its
// own definition in adyenWebhook.ts — every one of those hand lists omitted
// `merchant_filling`, so an application sitting in that stage vanished from
// every onboarding metric. Derive the groups from rank ranges instead so a
// newly inserted stage can't silently miss a bucket again.
import type { DealStage } from "@/types/merchant";

// Forward-only stage ranking. Adyen delivers webhooks at-least-once and out
// of order, so shouldAdvance() only ever advances a deal, never regresses it
// (a stale "pending" event must not undo an "approved" one). `satisfies
// Record<DealStage, number>` makes a missing/misspelled DealStage a compile
// error rather than a silent runtime gap.
export const STAGE_RANK = {
  prospect_created: 0,
  lead_link_sent: 1,
  quote_sent: 2,
  lead_analysis_pending: 3,
  analysis: 4,
  pricing: 5,
  proposal_ready: 6,
  proposal_sent: 7,
  // Sits above every quoting stage and below onboarding: a customer can
  // accept from a prepared quote (quote_sent) or from one they generated
  // themselves (analysis), and either way acceptance is what starts
  // onboarding.
  quote_accepted: 8,
  merchant_link_sent: 9,
  merchant_filling: 10,
  adyen_kyc_pending: 11,
  adyen_kyc_complete: 12,
  adyen_approved: 13,
  closed_lost: 14,
} satisfies Record<DealStage, number>;

export const STAGE_ORDER = (Object.keys(STAGE_RANK) as DealStage[]).sort(
  (a, b) => STAGE_RANK[a] - STAGE_RANK[b]
);

// "Proposal phase" — a quote/proposal has been produced and put in front of
// the customer, but they haven't accepted yet. There are two parallel routes
// to get there (the self-serve lead link's `quote_sent`, or the rep-authored
// `proposal_ready`/`proposal_sent`), so this isn't one contiguous rank span —
// the in-between working states (`lead_analysis_pending`, `analysis`,
// `pricing`) are deliberately excluded, they aren't "sent" yet.
export const PROPOSAL_STAGES: DealStage[] = STAGE_ORDER.filter(
  s =>
    s === "quote_sent" ||
    (STAGE_RANK[s] >= STAGE_RANK.proposal_ready && STAGE_RANK[s] <= STAGE_RANK.proposal_sent)
);

// "Onboarding phase" — the customer accepted and is moving through
// KYC/onboarding, up to (but excluding) the terminal `adyen_approved` /
// `closed_lost` states. A genuine rank RANGE on purpose: it's exactly the
// span from `quote_accepted` to `adyen_kyc_complete`, so a stage inserted
// anywhere in between (like `merchant_filling` was) is picked up
// automatically instead of requiring every dashboard to be updated by hand.
export const ONBOARDING_STAGES: DealStage[] = STAGE_ORDER.filter(
  s => STAGE_RANK[s] > STAGE_RANK.proposal_sent && STAGE_RANK[s] < STAGE_RANK.adyen_approved
);
