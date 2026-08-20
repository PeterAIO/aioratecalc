import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  buildRateStoryProperties,
  decodeSignatureUri,
  pickCardApplication,
  verifyCrmCardSignature,
  type CrmCardApplication,
} from "@/lib/adapters/hubspotCrmCard";
import type { ProposalOutput, StatementAnalysis } from "@/types/merchant";

const SECRET = "test-client-secret";
const METHOD = "GET";
const URI = "https://app.example.com/api/hubspot/crm-card?associatedObjectId=123&userEmail=rep%40aioapp.com";
const BODY = "";
const TIMESTAMP = "1700000000000";

function sign(method: string, uri: string, body: string, timestamp: string, secret: string): string {
  const rawString = `${method}${decodeSignatureUri(uri)}${body}${timestamp}`;
  return crypto.createHmac("sha256", secret).update(rawString, "utf8").digest("base64");
}

describe("decodeSignatureUri", () => {
  it("decodes the reserved characters HubSpot signs as literal", () => {
    expect(decodeSignatureUri("%3A%2F%40%21%24%27%28%29%2A%2C%3B")).toBe(":/@!$'()*,;");
  });

  it("leaves unrelated percent-encoding alone", () => {
    expect(decodeSignatureUri("foo%20bar%3D1")).toBe("foo%20bar%3D1");
  });
});

describe("verifyCrmCardSignature", () => {
  it("accepts a correctly signed request", () => {
    const signature = sign(METHOD, URI, BODY, TIMESTAMP, SECRET);
    const ok = verifyCrmCardSignature({
      method: METHOD,
      uri: URI,
      body: BODY,
      timestamp: TIMESTAMP,
      signature,
      clientSecret: SECRET,
      nowMs: Number(TIMESTAMP) + 1000,
    });
    expect(ok).toBe(true);
  });

  it("rejects when the client secret is missing (fail closed)", () => {
    const signature = sign(METHOD, URI, BODY, TIMESTAMP, SECRET);
    const ok = verifyCrmCardSignature({
      method: METHOD,
      uri: URI,
      body: BODY,
      timestamp: TIMESTAMP,
      signature,
      clientSecret: undefined,
      nowMs: Number(TIMESTAMP) + 1000,
    });
    expect(ok).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const signature = sign(METHOD, URI, BODY, TIMESTAMP, "wrong-secret");
    const ok = verifyCrmCardSignature({
      method: METHOD,
      uri: URI,
      body: BODY,
      timestamp: TIMESTAMP,
      signature,
      clientSecret: SECRET,
      nowMs: Number(TIMESTAMP) + 1000,
    });
    expect(ok).toBe(false);
  });

  it("rejects a tampered URI", () => {
    const signature = sign(METHOD, URI, BODY, TIMESTAMP, SECRET);
    const ok = verifyCrmCardSignature({
      method: METHOD,
      uri: URI.replace("123", "456"),
      body: BODY,
      timestamp: TIMESTAMP,
      signature,
      clientSecret: SECRET,
      nowMs: Number(TIMESTAMP) + 1000,
    });
    expect(ok).toBe(false);
  });

  it("rejects a timestamp older than 5 minutes", () => {
    const signature = sign(METHOD, URI, BODY, TIMESTAMP, SECRET);
    const ok = verifyCrmCardSignature({
      method: METHOD,
      uri: URI,
      body: BODY,
      timestamp: TIMESTAMP,
      signature,
      clientSecret: SECRET,
      nowMs: Number(TIMESTAMP) + 6 * 60 * 1000,
    });
    expect(ok).toBe(false);
  });

  it("rejects a missing signature or timestamp header", () => {
    expect(
      verifyCrmCardSignature({
        method: METHOD,
        uri: URI,
        body: BODY,
        timestamp: null,
        signature: "anything",
        clientSecret: SECRET,
      })
    ).toBe(false);
    expect(
      verifyCrmCardSignature({
        method: METHOD,
        uri: URI,
        body: BODY,
        timestamp: TIMESTAMP,
        signature: null,
        clientSecret: SECRET,
      })
    ).toBe(false);
  });
});

// Only the fields the card reads are set; everything else on a real
// StatementAnalysis/ProposalOutput is deliberately absent so a leak shows up
// as undefined rather than quietly passing.
const analysis = (over: Partial<StatementAnalysis> = {}) => ({
  currentProcessorName: "Fiserv",
  totalFees: 4321.5,
  effectiveRate: 0.0312,
  ...over,
}) as StatementAnalysis;

const proposal = (over: Partial<ProposalOutput> = {}) => ({
  projectedFees: { monthly: 3100, annual: 37_200, effectiveRate: 0.0247 },
  savings: { monthly: 823.05, annual: 9876.54, savingsPct: 0.19 },
  ...over,
}) as ProposalOutput;

const app = (over: Partial<CrmCardApplication> = {}): CrmCardApplication => ({
  updatedAt: "2026-08-01T00:00:00.000Z",
  analysis: null,
  proposal: null,
  processing: null,
  ...over,
});

describe("pickCardApplication", () => {
  it("returns null when the company has no linked application", () => {
    expect(pickCardApplication([])).toBeNull();
  });

  it("prefers the most recently updated application that has an analysis", () => {
    const analysed = app({ updatedAt: "2026-07-01T00:00:00.000Z", analysis: analysis() });
    const olderAnalysed = app({ updatedAt: "2026-06-01T00:00:00.000Z", analysis: analysis({ totalFees: 1 }) });
    // A brand-new prospect shell must not blank out the deal that has a story.
    const newerShell = app({ updatedAt: "2026-08-15T00:00:00.000Z" });
    expect(pickCardApplication([newerShell, olderAnalysed, analysed])).toBe(analysed);
  });

  it("falls back to the newest row when none has an analysis", () => {
    const newest = app({ updatedAt: "2026-08-15T00:00:00.000Z" });
    expect(pickCardApplication([app({ updatedAt: "2026-01-01T00:00:00.000Z" }), newest])).toBe(newest);
  });
});

describe("buildRateStoryProperties", () => {
  it("emits the six rep-safe rows with the documented dataTypes", () => {
    const props = buildRateStoryProperties([
      app({
        analysis: analysis(),
        proposal: proposal(),
        processing: { mcc: "5812" } as CrmCardApplication["processing"],
      }),
    ]);

    expect(props).toEqual([
      { label: "Current processor", dataType: "STRING", value: "Fiserv" },
      { label: "Current monthly fees", dataType: "CURRENCY", value: "4321.50", currencyCode: "USD" },
      { label: "Current effective rate", dataType: "STRING", value: "3.12%" },
      { label: "Proposed effective rate", dataType: "STRING", value: "2.47%" },
      { label: "Projected annual savings", dataType: "CURRENCY", value: "9876.54", currencyCode: "USD" },
      { label: "MCC", dataType: "STRING", value: "5812" },
    ]);
  });

  it("has nothing to say about a company with no linked application", () => {
    expect(buildRateStoryProperties([])).toEqual([]);
  });

  it("omits the proposal rows rather than emitting zeros when there's no proposal", () => {
    const props = buildRateStoryProperties([app({ analysis: analysis() })]);
    expect(props.map(p => p.label)).toEqual([
      "Current processor", "Current monthly fees", "Current effective rate",
    ]);
    expect(JSON.stringify(props)).not.toContain("0.00");
    expect(JSON.stringify(props)).not.toContain("0.00%");
  });

  it("omits every row rather than emitting zeros when there's no analysis at all", () => {
    expect(buildRateStoryProperties([app()])).toEqual([]);
  });

  it("omits blank and zero values instead of rendering them", () => {
    const props = buildRateStoryProperties([
      app({
        analysis: analysis({ currentProcessorName: "  ", totalFees: 0, effectiveRate: 0 }),
        processing: { mcc: "", currentProcessor: " " } as CrmCardApplication["processing"],
      }),
    ]);
    expect(props).toEqual([]);
  });

  it("falls back to the rep-entered processor when the statement didn't name one", () => {
    const props = buildRateStoryProperties([
      app({
        analysis: analysis({ currentProcessorName: "" }),
        processing: { currentProcessor: "Square" } as CrmCardApplication["processing"],
      }),
    ]);
    expect(props[0]).toEqual({ label: "Current processor", dataType: "STRING", value: "Square" });
  });

  // THE ONE THAT MATTERS. The card renders to whoever is looking at the HubSpot
  // record, so per-role pillowing is impossible here — AIO's economics must not
  // be derivable from it. The row handed in below deliberately carries the
  // forbidden columns to prove they can't ride along.
  it("never carries AIO's margin floor, Adyen cost basis or target margin", () => {
    const props = buildRateStoryProperties([
      {
        ...app({ analysis: analysis(), proposal: proposal(), processing: { mcc: "5812" } as CrmCardApplication["processing"] }),
        targetMargin: 0.008,
        marginFloor: 1234,
        adyenCostRate: 0.0021,
      } as CrmCardApplication,
    ]);

    expect(new Set(props.flatMap(p => Object.keys(p)))).toEqual(
      new Set(["label", "dataType", "value", "currencyCode"])
    );
    const serialized = JSON.stringify(props);
    for (const forbidden of [
      "margin", "Margin", "floor", "Floor", "adyen", "Adyen",
      "cost", "Cost", "bps", "interchange", "Interchange", "aioRevenue", "0.008", "0.0021",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
