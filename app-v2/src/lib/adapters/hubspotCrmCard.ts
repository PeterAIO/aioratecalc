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
import { fmtPct2 } from "@/lib/utils";
import type { ProcessingInfo, ProposalOutput, StatementAnalysis } from "@/types/merchant";

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

// ── The card body: the merchant's rate story ────────────────────────────────
// A classic card result may carry a `properties` array of {label, dataType,
// value} objects, which HubSpot renders WITHOUT them being pre-configured in
// the app's card settings ("the integration can also include its own custom
// properties without needing them to be defined in the card's settings").
// Legal dataTypes are exactly the eight below; there is no PERCENT, so rates
// go out as STRING with a pre-formatted value, and CURRENCY additionally
// requires an ISO 4217 currencyCode.
// https://developers.hubspot.com/docs/api-reference/legacy/crm/extensions/crm-cards/guide
//
// ⚠ TRUST BOUNDARY. This renders inside HubSpot to whoever is viewing the
// Company record, so the route cannot know which AIO user is asking and
// per-role pillowing is impossible here. Only two kinds of number may appear:
// the merchant's OWN current-state figures (read off their statement) and the
// customer-facing proposal outputs (what we already print on the proposal).
// AIO's economics must never appear — no margin floor, no Adyen cost basis, no
// targetMargin. That is why nothing below computes anything: every value is
// read straight off a stored `analysis`/`proposal`/`processing`, so
// derivePricing / getMarginFloor / calcAdyenCost are never reached from here.
export type CrmCardDataType =
  | "CURRENCY" | "DATE" | "DATETIME" | "EMAIL" | "LINK" | "NUMERIC" | "STATUS" | "STRING";

export type CrmCardProperty = {
  label: string;
  dataType: CrmCardDataType;
  value: string;
  currencyCode?: string;
};

// The only columns the card is allowed to read. Deliberately much narrower
// than MerchantApplication: the route selects exactly these four, so a
// forbidden field isn't in scope to leak even by accident.
export type CrmCardApplication = {
  updatedAt: Date | string;
  analysis: StatementAnalysis | null;
  proposal: ProposalOutput | null;
  processing: ProcessingInfo | null;
};

// CURRENCY takes a plain decimal string plus a currencyCode and does its own
// formatting, so fmt$ must NOT be applied — a "$" or a thousands separator
// would land in a field HubSpot parses as a number. Zero/absent means "we
// don't know it": omitted, never rendered as $0.00.
function money(label: string, n: number | null | undefined): CrmCardProperty | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n === 0) return null;
  return { label, dataType: "CURRENCY", value: n.toFixed(2), currencyCode: "USD" };
}

function rate(label: string, n: number | null | undefined): CrmCardProperty | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return { label, dataType: "STRING", value: fmtPct2(n) };
}

function text(label: string, s: string | null | undefined): CrmCardProperty | null {
  const value = (s ?? "").trim();
  return value ? { label, dataType: "STRING", value } : null;
}

/**
 * Which of a company's EasyOB applications the card speaks for. A company can
 * hold several; the card carries ONE result (its objectId is the HubSpot
 * company id, and application ids are uuids that can't be turned into the
 * distinct numeric objectIds extra results would need). So: the most recently
 * updated application that actually has a statement to talk about — a rep who
 * just spun up a second prospect shell shouldn't lose the rate story off the
 * deal that's already been analysed. Falls back to the newest row so the
 * processor/MCC still show when no statement has been read yet.
 */
export function pickCardApplication<T extends CrmCardApplication>(apps: T[]): T | null {
  if (apps.length === 0) return null;
  const ts = (a: T) => new Date(a.updatedAt).getTime() || 0;
  const byRecency = [...apps].sort((a, b) => ts(b) - ts(a));
  return byRecency.find(a => a.analysis) ?? byRecency[0];
}

/**
 * The six rep-safe rows. Anything we don't have is omitted rather than sent
 * as a zero, so a company with no application (or no analysis yet) renders as
 * the bare "Open in EasyOB" link instead of a row of $0.00.
 */
export function buildRateStoryProperties(apps: CrmCardApplication[]): CrmCardProperty[] {
  const app = pickCardApplication(apps);
  if (!app) return [];
  const analysis = app.analysis;
  return [
    text("Current processor", analysis?.currentProcessorName || app.processing?.currentProcessor),
    money("Current monthly fees", analysis?.totalFees),
    rate("Current effective rate", analysis?.effectiveRate),
    rate("Proposed effective rate", app.proposal?.projectedFees.effectiveRate),
    money("Projected annual savings", app.proposal?.savings.annual),
    text("MCC", app.processing?.mcc),
  ].filter((p): p is CrmCardProperty => p !== null);
}
