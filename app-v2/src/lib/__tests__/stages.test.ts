import { describe, it, expect } from "vitest";
import { STAGE_RANK, STAGE_ORDER, PROPOSAL_STAGES, ONBOARDING_STAGES } from "@/lib/stages";
import type { DealStage } from "@/types/merchant";

// Every DealStage member, so a stage added to the type but forgotten here
// fails at runtime too, not just via the `satisfies` compile-time check.
const ALL_STAGES: DealStage[] = [
  "prospect_created",
  "lead_link_sent",
  "lead_analysis_pending",
  "analysis",
  "pricing",
  "proposal_ready",
  "quote_sent",
  "proposal_sent",
  "quote_accepted",
  "merchant_link_sent",
  "merchant_filling",
  "adyen_kyc_pending",
  "adyen_kyc_complete",
  "adyen_approved",
  "closed_lost",
];

describe("STAGE_RANK / STAGE_ORDER", () => {
  it("has a rank for every DealStage, and only those", () => {
    expect(Object.keys(STAGE_RANK).sort()).toEqual([...ALL_STAGES].sort());
  });

  it("orders stages by ascending rank", () => {
    expect(STAGE_ORDER).toEqual(ALL_STAGES);
  });
});

describe("PROPOSAL_STAGES", () => {
  it("holds the same three stages the hand-copied bucket did", () => {
    expect(PROPOSAL_STAGES).toEqual(["proposal_ready", "quote_sent", "proposal_sent"]);
  });

  // The bucket used to be a disjunction because the rep's wizard and the
  // customer-link flow terminated at different, non-adjacent stages. Both now
  // end at the same customer quote link, so it is a plain rank range — and a
  // stage inserted inside that span is picked up automatically.
  it("is a contiguous rank range, not a special case", () => {
    const ranks = PROPOSAL_STAGES.map(s => STAGE_RANK[s]);
    expect(ranks).toEqual([STAGE_RANK.proposal_ready, STAGE_RANK.proposal_ready + 1, STAGE_RANK.proposal_ready + 2]);
    expect(ranks.at(-1)).toBe(STAGE_RANK.proposal_sent);
  });

  it("excludes the working stages nothing has been sent from", () => {
    for (const s of ["lead_link_sent", "lead_analysis_pending", "analysis", "pricing"] as DealStage[]) {
      expect(PROPOSAL_STAGES).not.toContain(s);
    }
  });

  // The wizard's terminus. proposal_ready → quote_sent has to be a forward
  // move, or issueCustomerQuoteLinkAction's shouldAdvance guard would silently
  // refuse to mark the deal as sent.
  it("ranks quote_sent above the wizard's proposal_ready", () => {
    expect(STAGE_RANK.quote_sent).toBeGreaterThan(STAGE_RANK.proposal_ready);
    expect(STAGE_RANK.quote_accepted).toBeGreaterThan(STAGE_RANK.quote_sent);
  });
});

describe("ONBOARDING_STAGES", () => {
  it("spans quote_accepted through adyen_kyc_complete, including merchant_filling", () => {
    expect(ONBOARDING_STAGES).toEqual([
      "quote_accepted",
      "merchant_link_sent",
      "merchant_filling",
      "adyen_kyc_pending",
      "adyen_kyc_complete",
    ]);
  });

  it("excludes the terminal adyen_approved/closed_lost stages", () => {
    expect(ONBOARDING_STAGES).not.toContain("adyen_approved");
    expect(ONBOARDING_STAGES).not.toContain("closed_lost");
  });
});
