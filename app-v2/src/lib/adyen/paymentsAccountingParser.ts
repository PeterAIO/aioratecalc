// Phase G: parser + aggregator for Adyen's `payments_accounting_report_{yyyy_MM_dd}.csv`.
// Pure functions, no I/O — the download lives in src/lib/adapters/adyenReports.ts
// and the upsert in ./actualsIngest.ts, so this file is unit-testable on its own.
//
// Three traps this file exists to avoid (all verified live 2026-08-18, see E2E-PLAN.md):
//
//  1. Restaurants pre-auth (pre-auth → incremental auth → tip adjust), so one
//     payment produces many rows. One day's file: 14,015 rows, ~3,468 payments.
//     We dedupe on `Psp Reference` at EXACTLY ONE record type — `SentForSettle`,
//     a will-settle basis. Changing that constant moves every average-ticket
//     number in the product, so it is deliberately a single named constant.
//  2. `Commission (SC)` is zero on every row for this account. AIO's cut is in
//     `Split Payment Data` instead: flattened JSON, amounts in MINOR UNITS. Sum
//     every item whose type is "Commission" — richer split configs also carry
//     PaymentFee / Fixed Fee / Remainder items, so "item2" is not a safe shortcut.
//  3. Staging traffic is in the live data (stores like `4-stagev2`). Only
//     `prod-{n}` is attributable; everything else is reported as an anomaly and
//     never attributed to a tenant.

// The record type we count payments at. See trap 1 above.
export const SETTLE_RECORD_TYPE = "SentForSettle";

// Record types observed in a real day's file. Anything outside this set is
// surfaced (not dropped) so a new Adyen behaviour can't quietly change totals.
const KNOWN_RECORD_TYPES = new Set([
  "Received",
  "AuthorisedPending",
  "Authorised",
  "SentForSettle",
  "ReceivedIncrementalAuth",
  "Refused",
  "Chargeback",
]);

// Only `prod-{n}` attributes to a tenant. `4-stagev2` and friends do not.
const PROD_STORE = /^prod-(\d+)$/;

const COL_PSP_REFERENCE = "Psp Reference";
const COL_RECORD_TYPE = "Record Type";
const COL_STORE = "Store";
const COL_AMOUNT = "Main Amount";
const COL_SPLIT = "Split Payment Data";
// Day of SALE, not settlement/batch date — keying months off the batch date
// smears transactions across month boundaries. `Creation Date` is the sale
// moment; `Booking Date` is the fallback when that optional column is absent.
const DATE_COLUMNS = ["Creation Date", "Booking Date"];

/** One (tenant, day-of-sale) aggregate. Money is in minor units (cents). */
export interface DailyTenantActual {
  tenantNumber: string;
  saleDate: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  transactionCount: number;
  grossVolumeCents: number;
  commissionCents: number;
}

export interface ReportAnomalies {
  /** Settle rows whose store is present but not `prod-{n}` (e.g. `4-stagev2`). */
  nonProdStores: { store: string; rows: number }[];
  /** Settle rows with no store at all — unattributable. */
  missingStoreRows: number;
  /** Settle rows whose `Main Amount` is blank or non-numeric. Excluded entirely. */
  unparseableAmountRows: number;
  /** Counted rows with an empty `Split Payment Data`. Volume kept, commission 0. */
  emptySplitRows: number;
  /** Counted rows whose split JSON did not parse. Volume kept, commission 0. */
  unparseableSplitRows: number;
  /** Counted rows whose split parsed but held no `Commission` item. */
  noCommissionItemRows: number;
  /** Extra rows sharing a Psp Reference at the settle record type. */
  duplicateSettleRows: number;
  /** Every record type in the file with its raw row count. */
  recordTypeCounts: Record<string, number>;
  /** Record types not in KNOWN_RECORD_TYPES — new Adyen behaviour to review. */
  unknownRecordTypes: string[];
}

export interface ParsedPaymentsReport {
  actuals: DailyTenantActual[];
  anomalies: ReportAnomalies;
  /** Raw data rows in the file (excluding the header). */
  rowCount: number;
  /** Which of DATE_COLUMNS the header actually provided. */
  dateColumn: string;
}

/**
 * RFC4180 CSV parse. `Split Payment Data` is a quoted field containing commas
 * AND doubled quotes around its JSON, so a split(",") shreds the row — hence a
 * real parser rather than a regex.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; // strip BOM

  for (; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Sums every `Commission`-typed split item, in minor units.
 * Returns null when the field can't be read at all (caller reports it).
 */
export function commissionCentsFromSplitData(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  let cents = 0;
  for (const [key, value] of Object.entries(obj)) {
    const m = /^split\.item(\d+)\.type$/.exec(key);
    if (!m || String(value) !== "Commission") continue;
    const amount = obj[`split.item${m[1]}.amount`];
    const n = Number(String(amount ?? "").trim());
    if (Number.isFinite(n)) cents += Math.round(n);
  }
  return cents;
}

// Adyen dates are "YYYY-MM-DD HH:mm:ss"; we only ever want the day.
function toDay(raw: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function toCents(raw: string): number | null {
  const trimmed = raw.trim();
  // Number("") is 0, not NaN — a blank amount must not become a free $0 payment.
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function parsePaymentsAccountingReport(csv: string): ParsedPaymentsReport {
  const rows = parseCsv(csv);
  const header = rows[0];
  if (!header) throw new Error("Adyen report is empty (no header row)");

  const idx = new Map(header.map((name, i) => [name.trim(), i]));
  const dateColumn = DATE_COLUMNS.find((c) => idx.has(c));
  for (const required of [COL_PSP_REFERENCE, COL_RECORD_TYPE, COL_STORE, COL_AMOUNT, COL_SPLIT]) {
    if (!idx.has(required)) throw new Error(`Adyen report is missing the "${required}" column`);
  }
  if (!dateColumn) {
    throw new Error(`Adyen report has none of the date columns: ${DATE_COLUMNS.join(", ")}`);
  }

  const cell = (row: string[], name: string) => row[idx.get(name)!] ?? "";

  const anomalies: ReportAnomalies = {
    nonProdStores: [],
    missingStoreRows: 0,
    unparseableAmountRows: 0,
    emptySplitRows: 0,
    unparseableSplitRows: 0,
    noCommissionItemRows: 0,
    duplicateSettleRows: 0,
    recordTypeCounts: {},
    unknownRecordTypes: [],
  };
  const nonProd = new Map<string, number>();
  const seenPspReferences = new Set<string>();
  const buckets = new Map<string, DailyTenantActual>();
  let rowCount = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // A trailing blank line parses as [""] — not a record.
    if (row.length === 1 && row[0].trim() === "") continue;
    rowCount++;

    const recordType = cell(row, COL_RECORD_TYPE).trim();
    anomalies.recordTypeCounts[recordType] = (anomalies.recordTypeCounts[recordType] ?? 0) + 1;
    if (recordType !== SETTLE_RECORD_TYPE) continue;

    // Dedupe: pre-auth means one payment can appear many times, including more
    // than once at the settle record type after a tip adjust.
    const pspReference = cell(row, COL_PSP_REFERENCE).trim();
    if (pspReference && seenPspReferences.has(pspReference)) {
      anomalies.duplicateSettleRows++;
      continue;
    }
    if (pspReference) seenPspReferences.add(pspReference);

    const store = cell(row, COL_STORE).trim();
    if (!store) {
      anomalies.missingStoreRows++;
      continue;
    }
    const storeMatch = PROD_STORE.exec(store);
    if (!storeMatch) {
      nonProd.set(store, (nonProd.get(store) ?? 0) + 1);
      continue;
    }

    const grossVolumeCents = toCents(cell(row, COL_AMOUNT));
    const saleDate = toDay(cell(row, dateColumn));
    if (grossVolumeCents === null || saleDate === null) {
      anomalies.unparseableAmountRows++;
      continue;
    }

    // Commission problems never discard the payment — volume and count are
    // still real, so a missing split shows up as an anomaly, not a hole.
    const commissionCents = commissionCentsFromSplitData(cell(row, COL_SPLIT));
    if (commissionCents === null) {
      if (cell(row, COL_SPLIT).trim() === "") anomalies.emptySplitRows++;
      else anomalies.unparseableSplitRows++;
    } else if (commissionCents === 0) {
      anomalies.noCommissionItemRows++;
    }

    const tenantNumber = storeMatch[1];
    const key = `${tenantNumber}|${saleDate}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        tenantNumber,
        saleDate,
        month: saleDate.slice(0, 7),
        transactionCount: 0,
        grossVolumeCents: 0,
        commissionCents: 0,
      };
      buckets.set(key, bucket);
    }
    bucket.transactionCount++;
    bucket.grossVolumeCents += grossVolumeCents;
    bucket.commissionCents += commissionCents ?? 0;
  }

  anomalies.nonProdStores = [...nonProd.entries()]
    .map(([store, rows]) => ({ store, rows }))
    .sort((a, b) => a.store.localeCompare(b.store));
  anomalies.unknownRecordTypes = Object.keys(anomalies.recordTypeCounts)
    .filter((t) => !KNOWN_RECORD_TYPES.has(t))
    .sort();

  const actuals = [...buckets.values()].sort(
    (a, b) => a.saleDate.localeCompare(b.saleDate) || Number(a.tenantNumber) - Number(b.tenantNumber)
  );
  return { actuals, anomalies, rowCount, dateColumn };
}
