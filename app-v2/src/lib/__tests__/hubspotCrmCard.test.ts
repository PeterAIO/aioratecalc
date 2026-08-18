import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { decodeSignatureUri, verifyCrmCardSignature } from "@/lib/adapters/hubspotCrmCard";

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
