import { describe, it, expect } from "vitest";
import { STAGE_RANK, STAGE_ORDER, PROPOSAL_STAGES, ONBOARDING_STAGES } from "@/lib/stages";
import type { DealStage } from "@/types/merchant";

// Every DealStage member, so a stage added to the type but forgotten here
// fails at runtime too, not just via the `satisfies` compile-time check.
const ALL_STAGES: DealStage[] = [
  "prospect_created",
  "lead_link_sent",
  "quote_sent",
  "lead_analysis_pending",
  "analysis",
  "pricing",
  "proposal_ready",
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
  it("matches the historical hand-copied bucket", () => {
    expect(PROPOSAL_STAGES).toEqual(["quote_sent", "proposal_ready", "proposal_sent"]);
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
