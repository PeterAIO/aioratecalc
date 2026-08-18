// Signature verification for HubSpot's Classic CRM Card data-fetch requests.
// Kept separate from the route handler so it can be unit-tested without a
// server, same pattern as adyenWebhook.ts's verifyBalancePlatformHmac.
//
// Scheme: HubSpot request-signature v3.
// https://developers.hubspot.com/docs/api/webhooks/validating-requests
// Headers: X-HubSpot-Signature-v3 (base64 HMAC-SHA256) + X-HubSpot-Request-Timestamp (ms epoch).
// Signed string = httpMethod + uri + requestBody + timestamp, HMAC-SHA256'd with the
// app's client secret, base64-encoded. GET requests (CRM card data-fetch is always GET)
// carry no body, so requestBody is the empty string.
import crypto from "crypto";

const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000; // "reject if older than 5 minutes"

// HubSpot signs the URI with a specific set of reserved characters left
// decoded (literal) rather than percent-encoded, even though the raw wire
// request may have them percent-encoded (e.g. "@" in a userEmail query
// param arriving as "%40"). Reconstructing the exact string HubSpot hashed
// requires undoing that same encoding before hashing our side.
const URI_DECODE_MAP: Array<[RegExp, string]> = [
  [/%3A/gi, ":"],
  [/%2F/gi, "/"],
  [/%40/gi, "@"],
  [/%21/gi, "!"],
  [/%24/gi, "$"],
  [/%27/gi, "'"],
  [/%28/gi, "("],
  [/%29/gi, ")"],
  [/%2A/gi, "*"],
  [/%2C/gi, ","],
  [/%3B/gi, ";"],
];

export function decodeSignatureUri(uri: string): string {
  return URI_DECODE_MAP.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), uri);
}

export interface VerifyCrmCardSignatureOptions {
  method: string;
  /** Full absolute URL as received, e.g. "https://host/api/hubspot/crm-card?...". */
  uri: string;
  /** Raw request body string; empty string for GET requests with no body. */
  body: string;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  clientSecret: string | undefined;
  /** Injectable for tests; defaults to Date.now(). */
  nowMs?: number;
}

/**
 * Verify a HubSpot v3 request signature. Fails closed: any missing input
 * (secret, header, malformed timestamp) or stale timestamp returns false.
 */
export function verifyCrmCardSignature(opts: VerifyCrmCardSignatureOptions): boolean {
  const { method, uri, body, timestamp, signature, clientSecret } = opts;
  if (!clientSecret || !timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = opts.nowMs ?? Date.now();
  if (Math.abs(now - ts) > MAX_TIMESTAMP_SKEW_MS) return false;

  const rawString = `${method}${decodeSignatureUri(uri)}${body}${timestamp}`;
  const computed = crypto.createHmac("sha256", clientSecret).update(rawString, "utf8").digest("base64");

  const a = Buffer.from(computed);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
