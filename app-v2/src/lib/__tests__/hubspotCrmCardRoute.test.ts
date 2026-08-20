import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { decodeSignatureUri } from "@/lib/adapters/hubspotCrmCard";

// The route's only collaborator is the DB, so it's stubbed here. What's under
// test is the contract HubSpot sees: the signature gate, and exactly which
// fields cross into the card payload.
const where = vi.fn();
const from = vi.fn(() => ({ where }));
const select = vi.fn((_columns?: Record<string, unknown>) => ({ from }));

vi.mock("@/lib/db/client", () => ({ db: { select } }));

const { GET } = await import("@/app/api/hubspot/crm-card/route");

const SECRET = "test-client-secret";
const BASE = "https://easyob.example.com";
const COMPANY_ID = "334295287484";

function request(companyId = COMPANY_ID) {
  const uri = `${BASE}/api/hubspot/crm-card?associatedObjectId=${companyId}&userEmail=rep%40aioapp.com`;
  const timestamp = String(Date.now());
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(`GET${decodeSignatureUri(uri)}${timestamp}`, "utf8")
    .digest("base64");
  return new NextRequest(uri, {
    headers: { "x-hubspot-request-timestamp": timestamp, "x-hubspot-signature-v3": signature },
  });
}

const ANALYSIS = { currentProcessorName: "Fiserv", totalFees: 4321.5, effectiveRate: 0.0312 };
const PROPOSAL = {
  projectedFees: { monthly: 3100, annual: 37_200, effectiveRate: 0.0247 },
  savings: { monthly: 823.05, annual: 9876.54, savingsPct: 0.19 },
};

const LINK = `${BASE}/rep/prospects/new?hubspotCompanyId=${COMPANY_ID}`;

beforeEach(() => {
  select.mockClear();
  from.mockClear();
  where.mockReset();
  where.mockResolvedValue([]);
  process.env.HUBSPOT_CRM_CARD_CLIENT_SECRET = SECRET;
  process.env.NEXT_PUBLIC_BASE_URL = BASE;
});

afterEach(() => {
  delete process.env.HUBSPOT_CRM_CARD_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_BASE_URL;
});

describe("GET /api/hubspot/crm-card — the gate", () => {
  it("fails closed with no client secret configured, and never touches the DB", async () => {
    delete process.env.HUBSPOT_CRM_CARD_CLIENT_SECRET;
    const res = await GET(request());
    expect(res.status).toBe(503);
    expect(select).not.toHaveBeenCalled();
  });

  it("rejects an unsigned request", async () => {
    const uri = `${BASE}/api/hubspot/crm-card?associatedObjectId=${COMPANY_ID}`;
    const res = await GET(new NextRequest(uri));
    expect(res.status).toBe(401);
    expect(select).not.toHaveBeenCalled();
  });

  it("rejects a badly-signed request", async () => {
    const uri = `${BASE}/api/hubspot/crm-card?associatedObjectId=${COMPANY_ID}`;
    const res = await GET(
      new NextRequest(uri, {
        headers: {
          "x-hubspot-request-timestamp": String(Date.now()),
          "x-hubspot-signature-v3": "not-the-signature",
        },
      })
    );
    expect(res.status).toBe(401);
    expect(select).not.toHaveBeenCalled();
  });

  it("still refuses a non-numeric associatedObjectId", async () => {
    const res = await GET(request("not-a-number"));
    expect(res.status).toBe(400);
    expect(select).not.toHaveBeenCalled();
  });
});

describe("GET /api/hubspot/crm-card — the card", () => {
  it("returns just the Open in EasyOB link when no application is linked", async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: [{ objectId: Number(COMPANY_ID), title: "Open in EasyOB", link: LINK }],
    });
  });

  it("reads only the four card columns off the linked application", async () => {
    await GET(request());
    expect(Object.keys(select.mock.calls[0][0] ?? {}).sort()).toEqual([
      "analysis", "processing", "proposal", "updatedAt",
    ]);
  });

  it("renders the rate story for a company whose application has an analysis", async () => {
    where.mockResolvedValue([
      { updatedAt: new Date("2026-08-01"), analysis: ANALYSIS, proposal: PROPOSAL, processing: { mcc: "5812" } },
    ]);

    const body = await (await GET(request())).json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].title).toBe("Open in EasyOB");
    expect(body.results[0].link).toBe(LINK);
    expect(body.results[0].properties).toEqual([
      { label: "Current processor", dataType: "STRING", value: "Fiserv" },
      { label: "Current monthly fees", dataType: "CURRENCY", value: "4321.50", currencyCode: "USD" },
      { label: "Current effective rate", dataType: "STRING", value: "3.12%" },
      { label: "Proposed effective rate", dataType: "STRING", value: "2.47%" },
      { label: "Projected annual savings", dataType: "CURRENCY", value: "9876.54", currencyCode: "USD" },
      { label: "MCC", dataType: "STRING", value: "5812" },
    ]);
  });

  it("omits the properties block entirely when there's no analysis yet", async () => {
    where.mockResolvedValue([
      { updatedAt: new Date("2026-08-01"), analysis: null, proposal: null, processing: null },
    ]);
    const body = await (await GET(request())).json();
    expect(body.results[0]).not.toHaveProperty("properties");
    expect(JSON.stringify(body)).not.toContain("0.00");
  });

  it("still renders the link when the lookup blows up", async () => {
    where.mockRejectedValue(new Error("connection refused"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect((await res.json()).results[0]).toEqual({
      objectId: Number(COMPANY_ID), title: "Open in EasyOB", link: LINK,
    });
    err.mockRestore();
  });

  // THE ONE THAT MATTERS. HubSpot shows this card to whoever opens the record,
  // so the payload can't be pillowed per role — AIO's economics must simply not
  // be in it. The row below carries the forbidden columns a widened select
  // would hand over, to prove they don't ride along.
  it("leaks no margin floor, Adyen cost or target margin into the payload", async () => {
    where.mockResolvedValue([
      {
        updatedAt: new Date("2026-08-01"),
        analysis: ANALYSIS,
        proposal: PROPOSAL,
        processing: { mcc: "5812" },
        targetMargin: "0.008",
        marginFloor: 1234,
        adyenIds: { legalEntityId: "LE123" },
      },
    ]);

    const body = await (await GET(request())).json();
    expect(Object.keys(body)).toEqual(["results"]);
    expect(Object.keys(body.results[0]).sort()).toEqual(["link", "objectId", "properties", "title"]);
    expect(new Set(body.results[0].properties.flatMap((p: object) => Object.keys(p)))).toEqual(
      new Set(["label", "dataType", "value", "currencyCode"])
    );

    const serialized = JSON.stringify(body);
    for (const forbidden of [
      "margin", "Margin", "floor", "Floor", "adyen", "Adyen",
      "cost", "Cost", "bps", "interchange", "Interchange", "aioRevenue", "0.008", "LE123",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
