import { describe, it, expect } from "vitest";
import { buildEasyobLink, planEasyobLinkUpdates, type EasyobLinkCompany } from "@/lib/adapters/hubspot";

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
