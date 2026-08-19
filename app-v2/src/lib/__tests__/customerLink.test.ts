import { describe, it, expect } from "vitest";
import { resolveLeadLinkIssue, type CustomerLinkSlot } from "@/lib/customerLink";

const NOW = Date.parse("2026-08-19T12:00:00.000Z");
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const DAY = 24 * 60 * 60 * 1000;

const slot = (over: Partial<CustomerLinkSlot> = {}): CustomerLinkSlot => ({
  customerLinkToken: null,
  customerLinkPurpose: null,
  customerLinkExpiresAt: null,
  ...over,
});

describe("resolveLeadLinkIssue — preserving a live quote link", () => {
  it("reuses a live lead_upload token so the merchant's URL keeps working", () => {
    const decision = resolveLeadLinkIssue(
      slot({ customerLinkToken: "tok-live", customerLinkPurpose: "lead_upload", customerLinkExpiresAt: iso(7 * DAY) }),
      NOW
    );
    expect(decision).toEqual({ reuse: true, token: "tok-live" });
  });

  // A token with no recorded expiry is treated as live by /lead/[token] and both
  // lead API routes (they only compare when customerLinkExpiresAt is set), so
  // reusing it here keeps this decision and those gates in agreement.
  it("reuses a lead_upload token that has no recorded expiry", () => {
    expect(
      resolveLeadLinkIssue(
        slot({ customerLinkToken: "tok-noexp", customerLinkPurpose: "lead_upload", customerLinkExpiresAt: null }),
        NOW
      )
    ).toEqual({ reuse: true, token: "tok-noexp" });
  });

  // Same reason: the lead routes compare `expiresAt.getTime() < now`, and an
  // unparseable date yields NaN, which fails that comparison — i.e. still live.
  it("reuses a lead_upload token whose expiry is unparseable, matching the lead routes", () => {
    expect(
      resolveLeadLinkIssue(
        slot({ customerLinkToken: "tok-bad", customerLinkPurpose: "lead_upload", customerLinkExpiresAt: "not-a-date" }),
        NOW
      )
    ).toEqual({ reuse: true, token: "tok-bad" });
  });

  it("treats an expiry exactly at now as still live, not expired", () => {
    expect(
      resolveLeadLinkIssue(
        slot({ customerLinkToken: "tok-edge", customerLinkPurpose: "lead_upload", customerLinkExpiresAt: iso(0) }),
        NOW
      )
    ).toEqual({ reuse: true, token: "tok-edge" });
  });
});

describe("resolveLeadLinkIssue — minting a fresh token", () => {
  it("mints when the application has never had a link", () => {
    expect(resolveLeadLinkIssue(slot(), NOW)).toEqual({ reuse: false });
  });

  it("mints when the existing lead_upload token has expired", () => {
    expect(
      resolveLeadLinkIssue(
        slot({ customerLinkToken: "tok-old", customerLinkPurpose: "lead_upload", customerLinkExpiresAt: iso(-1) }),
        NOW
      )
    ).toEqual({ reuse: false });
  });

  // The reverse-direction case. A kyc_handoff value can only be a legacy row
  // (nothing writes that purpose any more), and no URL was ever built from it —
  // /lead/[token] and both lead routes require purpose === "lead_upload" — so
  // replacing it destroys nothing the merchant is holding. It must NOT be
  // reused, or the resulting link would fail its own purpose gate.
  it("never reuses a kyc_handoff token, even an unexpired one", () => {
    expect(
      resolveLeadLinkIssue(
        slot({ customerLinkToken: "tok-kyc", customerLinkPurpose: "kyc_handoff", customerLinkExpiresAt: iso(7 * DAY) }),
        NOW
      )
    ).toEqual({ reuse: false });
  });

  it("mints when a purpose is recorded but the token itself is missing", () => {
    expect(
      resolveLeadLinkIssue(
        slot({ customerLinkToken: null, customerLinkPurpose: "lead_upload", customerLinkExpiresAt: iso(7 * DAY) }),
        NOW
      )
    ).toEqual({ reuse: false });
  });
});

describe("resolveLeadLinkIssue — repeated issues", () => {
  // The actual defect: a rep clicking "send the customer link" twice must not
  // hand out a second URL that silently kills the first.
  it("returns the same token across successive issues within the TTL", () => {
    const first = resolveLeadLinkIssue(slot(), NOW);
    expect(first.reuse).toBe(false);

    // Caller mints and persists token + a fresh 14-day expiry.
    const persisted = slot({
      customerLinkToken: "tok-1",
      customerLinkPurpose: "lead_upload",
      customerLinkExpiresAt: iso(14 * DAY),
    });

    const second = resolveLeadLinkIssue(persisted, NOW + DAY);
    expect(second).toEqual({ reuse: true, token: "tok-1" });

    // …and again a week later, still inside the original window.
    expect(resolveLeadLinkIssue(persisted, NOW + 8 * DAY)).toEqual({ reuse: true, token: "tok-1" });
  });

  it("is a pure decision — it does not mutate the slot it is given", () => {
    const s = slot({ customerLinkToken: "tok", customerLinkPurpose: "lead_upload", customerLinkExpiresAt: iso(DAY) });
    const snapshot = { ...s };
    resolveLeadLinkIssue(s, NOW);
    expect(s).toEqual(snapshot);
  });
});
