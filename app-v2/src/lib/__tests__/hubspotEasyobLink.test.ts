import { describe, it, expect } from "vitest";
import {
  buildEasyobLink,
  planEasyobLinkUpdates,
  isPublicBaseUrl,
  countBatchUpdateOutcome,
  type EasyobLinkCompany,
} from "@/lib/adapters/hubspot";

const BASE = "https://easyob.example.com";

describe("buildEasyobLink", () => {
  it("builds the prospect-prefill deep link for a company id", () => {
    expect(buildEasyobLink("123", BASE)).toBe(
      "https://easyob.example.com/rep/prospects/new?hubspotCompanyId=123"
    );
  });
});

describe("planEasyobLinkUpdates", () => {
  it("plans an update for a company with no easyob_link", () => {
    const companies: EasyobLinkCompany[] = [{ id: "1", properties: { easyob_link: null } }];
    expect(planEasyobLinkUpdates(companies, BASE)).toEqual([
      { id: "1", properties: { easyob_link: buildEasyobLink("1", BASE) } },
    ]);
  });

  it("plans an update for a company with an empty-string easyob_link", () => {
    const companies: EasyobLinkCompany[] = [{ id: "2", properties: { easyob_link: "" } }];
    expect(planEasyobLinkUpdates(companies, BASE)).toEqual([
      { id: "2", properties: { easyob_link: buildEasyobLink("2", BASE) } },
    ]);
  });

  it("plans an update for a company whose link points at a stale id or base URL", () => {
    const companies: EasyobLinkCompany[] = [
      { id: "3", properties: { easyob_link: "https://old.example.com/rep/prospects/new?hubspotCompanyId=3" } },
      { id: "4", properties: { easyob_link: "https://easyob.example.com/rep/prospects/new?hubspotCompanyId=999" } },
    ];
    expect(planEasyobLinkUpdates(companies, BASE)).toEqual([
      { id: "3", properties: { easyob_link: buildEasyobLink("3", BASE) } },
      { id: "4", properties: { easyob_link: buildEasyobLink("4", BASE) } },
    ]);
  });

  it("skips a company whose easyob_link already matches", () => {
    const companies: EasyobLinkCompany[] = [
      { id: "5", properties: { easyob_link: buildEasyobLink("5", BASE) } },
    ];
    expect(planEasyobLinkUpdates(companies, BASE)).toEqual([]);
  });

  it("handles a mixed page, only planning the companies that need it", () => {
    const companies: EasyobLinkCompany[] = [
      { id: "6", properties: { easyob_link: buildEasyobLink("6", BASE) } },
      { id: "7", properties: { easyob_link: null } },
      { id: "8", properties: {} },
    ];
    expect(planEasyobLinkUpdates(companies, BASE)).toEqual([
      { id: "7", properties: { easyob_link: buildEasyobLink("7", BASE) } },
      { id: "8", properties: { easyob_link: buildEasyobLink("8", BASE) } },
    ]);
  });

  it("returns an empty plan for an empty page", () => {
    expect(planEasyobLinkUpdates([], BASE)).toEqual([]);
  });
});

describe("isPublicBaseUrl", () => {
  it("rejects localhost", () => {
    expect(isPublicBaseUrl("http://localhost:5001")).toBe(false);
  });

  it("rejects 127.0.0.1", () => {
    expect(isPublicBaseUrl("http://127.0.0.1:3000")).toBe(false);
  });

  it("rejects a bare hostname with no dot", () => {
    expect(isPublicBaseUrl("http://easyob")).toBe(false);
  });

  it("rejects an empty/unset value", () => {
    expect(isPublicBaseUrl("")).toBe(false);
    expect(isPublicBaseUrl(undefined)).toBe(false);
  });

  it("rejects an unparseable value", () => {
    expect(isPublicBaseUrl("not-a-url")).toBe(false);
  });

  it("accepts a valid public https URL", () => {
    expect(isPublicBaseUrl("https://easyob.example.com")).toBe(true);
  });
});

describe("countBatchUpdateOutcome", () => {
  it("counts a full-success (200) response from results alone", () => {
    const body = { status: "COMPLETE", results: [{ id: "1" }, { id: "2" }] };
    expect(countBatchUpdateOutcome(body, 2)).toEqual({ updated: 2, failed: 0 });
  });

  it("counts a 207 MULTI_STATUS partial failure using numErrors", () => {
    const body = {
      status: "COMPLETE",
      results: [{ id: "1" }],
      numErrors: 1,
      errors: [{ status: "error", category: "OBJECT_NOT_FOUND", context: { ids: ["2"] } }],
    };
    expect(countBatchUpdateOutcome(body, 2)).toEqual({ updated: 1, failed: 1 });
  });

  it("falls back to requestedCount - updated when numErrors is absent", () => {
    const body = { results: [{ id: "1" }] };
    expect(countBatchUpdateOutcome(body, 3)).toEqual({ updated: 1, failed: 2 });
  });

  it("treats a body with no results and no error info as a total failure", () => {
    expect(countBatchUpdateOutcome({}, 5)).toEqual({ updated: 0, failed: 5 });
  });

  it("never reports negative failures when results exceeds requestedCount", () => {
    const body = { results: [{ id: "1" }, { id: "2" }] };
    expect(countBatchUpdateOutcome(body, 1)).toEqual({ updated: 2, failed: 0 });
  });
});
