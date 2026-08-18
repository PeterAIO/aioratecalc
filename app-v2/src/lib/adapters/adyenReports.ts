// Phase G: Adyen report download client.
//   GET {base}/MerchantAccount/{merchantAccount}/{filename}   X-API-Key
// Verified live 2026-08-18 with the report service user
// (report_733223@Company.AIOAppInc, Merchant Report Download role only):
// real key → 404 on a nonexistent file, garbage key → 401, no key → 401, and
// Company/… → 403 (the credential is merchant-scoped). So a 404 genuinely means
// "not generated yet" and is distinguishable from an auth failure.
//
// ⚠️ The host is deliberately NOT derived from ADYEN_ENVIRONMENT the way
// adapters/adyen.ts does it. That var is `test` while ADYEN_REPORT_API_KEY is a
// LIVE credential — resolving the host from it would hit ca-test with a live key
// and 401, looking exactly like a bad credential. This resolves independently.

import "server-only";

const DEFAULT_REPORT_BASE_URL = "https://ca-live.adyen.com/reports/download";

export type AdyenReportErrorKind = "unauthorized" | "forbidden" | "not_found" | "http";

export class AdyenReportError extends Error {
  constructor(
    readonly kind: AdyenReportErrorKind,
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AdyenReportError";
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * `payments_accounting_report_{yyyy_MM_dd}.csv` — the daily, store-attributed
 * report Phase G ingests. A Date is formatted from its UTC parts; pass a
 * "YYYY-MM-DD" string when the caller already knows the report day.
 */
export function paymentsAccountingReportFilename(date: Date | string): string {
  const day =
    typeof date === "string"
      ? date
      : `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) throw new Error(`Invalid Adyen report date: ${day}`);
  return `payments_accounting_report_${m[1]}_${m[2]}_${m[3]}.csv`;
}

export function reportDownloadUrl(filename: string): string {
  const base = (process.env.ADYEN_REPORT_BASE_URL || DEFAULT_REPORT_BASE_URL).replace(/\/+$/, "");
  const merchantAccount = process.env.ADYEN_POS_MERCHANT_ACCOUNT;
  if (!merchantAccount) throw new Error("ADYEN_POS_MERCHANT_ACCOUNT is required to download Adyen reports");
  return `${base}/MerchantAccount/${merchantAccount}/${filename}`;
}

/** Downloads one report as CSV text. Throws AdyenReportError with a distinct kind. */
export async function downloadReport(filename: string): Promise<string> {
  const apiKey = process.env.ADYEN_REPORT_API_KEY;
  if (!apiKey) throw new Error("ADYEN_REPORT_API_KEY is required to download Adyen reports (Phase G)");
  const url = reportDownloadUrl(filename);

  const res = await fetch(url, {
    headers: { "X-API-Key": apiKey, "Accept-Encoding": "gzip" },
  });
  if (res.ok) return res.text();

  if (res.status === 401) {
    throw new AdyenReportError("unauthorized", 401, `Adyen report download rejected the key for ${filename}`);
  }
  if (res.status === 403) {
    // Observed when the path names the company instead of the merchant account —
    // this credential only reaches MerchantAccount/AIOAppIncPOS.
    throw new AdyenReportError("forbidden", 403, `Adyen report ${filename} is outside this credential's scope`);
  }
  if (res.status === 404) {
    throw new AdyenReportError("not_found", 404, `Adyen has not generated ${filename}`);
  }
  throw new AdyenReportError("http", res.status, `Adyen report download for ${filename} failed (${res.status}): ${await res.text()}`);
}
