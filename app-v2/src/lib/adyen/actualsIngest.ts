// Phase G: idempotent upsert of one parsed Adyen payments accounting report.
//
// Idempotency is mandatory, not defensive — webhooks duplicate and reports get
// refetched. The shape:
//   1. delete every merchant_daily_actuals row this filename previously wrote
//   2. insert this parse's rows for the same filename
//   3. RECOMPUTE (set, never increment) merchant_monthly_actuals for every
//      (tenant, month) touched — before and after — by re-summing the daily table
//   4. record the filename last
// Step 4 last means a crash anywhere leaves the file unrecorded, so the cron
// backstop retries it and step 1 makes that retry clean. neon-http has no
// interactive transactions, hence the ordering rather than a BEGIN/COMMIT.

import "server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { merchantDailyActuals, merchantMonthlyActuals, adyenProcessedReports } from "@/lib/db/schema";
import type { ParsedPaymentsReport } from "./paymentsAccountingParser";

// Cents → the numeric(_, 2) string the rest of the schema stores money as.
function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

// The report date encoded in payments_accounting_report_{yyyy_MM_dd}.csv.
// Null for any other filename — it's a diagnostic column, not a key.
function reportDateFromFilename(filename: string): string | null {
  const m = /_(\d{4})_(\d{2})_(\d{2})\.csv$/.exec(filename);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export interface IngestResult {
  dailyRows: number;
  monthsRecomputed: number;
}

export async function ingestPaymentsAccountingReport(
  filename: string,
  parsed: ParsedPaymentsReport
): Promise<IngestResult> {
  // (tenant, month) pairs this file used to touch — they must be recomputed even
  // if the new parse no longer produces them, or a corrected report leaves stale
  // volume behind in the monthly table.
  const previous = await db
    .select({ tenantNumber: merchantDailyActuals.tenantNumber, month: merchantDailyActuals.month })
    .from(merchantDailyActuals)
    .where(eq(merchantDailyActuals.reportFilename, filename));

  const affected = new Map<string, { tenantNumber: string; month: string }>();
  for (const p of previous) affected.set(`${p.tenantNumber}|${p.month}`, p);
  for (const a of parsed.actuals) {
    affected.set(`${a.tenantNumber}|${a.month}`, { tenantNumber: a.tenantNumber, month: a.month });
  }

  await db.delete(merchantDailyActuals).where(eq(merchantDailyActuals.reportFilename, filename));

  if (parsed.actuals.length > 0) {
    await db.insert(merchantDailyActuals).values(
      parsed.actuals.map((a) => ({
        reportFilename: filename,
        tenantNumber: a.tenantNumber,
        saleDate: a.saleDate,
        month: a.month,
        grossVolume: centsToAmount(a.grossVolumeCents),
        transactionCount: a.transactionCount,
        aioCommission: centsToAmount(a.commissionCents),
        updatedAt: new Date(),
      }))
    );
  }

  await recomputeMonths([...affected.values()]);

  const processed = {
    filename,
    reportDate: reportDateFromFilename(filename),
    rowCount: parsed.rowCount,
    transactionCount: parsed.actuals.reduce((n, a) => n + a.transactionCount, 0),
    anomalies: parsed.anomalies,
    processedAt: new Date(),
  };
  await db
    .insert(adyenProcessedReports)
    .values(processed)
    .onConflictDoUpdate({ target: adyenProcessedReports.filename, set: processed });

  return { dailyRows: parsed.actuals.length, monthsRecomputed: affected.size };
}

// Sums each (tenant, month) pair out of the daily table and SETs it (never
// increments), in one grouped SELECT + one bulk upsert instead of one
// round-trip pair per query. A pair with zero matching daily rows simply
// doesn't come back as a GROUP BY row at all (unlike the old single-pair
// aggregate query, which always returned one row via `coalesce(sum(...), 0)`)
// — so any pair missing from the query result is filled in with zeros here,
// preserving the old "SET to zero, don't delete the monthly row" behavior for
// a pair whose rows all disappeared on reprocess.
async function recomputeMonths(pairs: { tenantNumber: string; month: string }[]): Promise<void> {
  if (pairs.length === 0) return;

  const totals = await db
    .select({
      tenantNumber: merchantDailyActuals.tenantNumber,
      month: merchantDailyActuals.month,
      grossVolume: sql<string>`sum(${merchantDailyActuals.grossVolume})`,
      transactionCount: sql<number>`sum(${merchantDailyActuals.transactionCount})::int`,
      aioCommission: sql<string>`sum(${merchantDailyActuals.aioCommission})`,
    })
    .from(merchantDailyActuals)
    .where(
      or(
        ...pairs.map((p) =>
          and(eq(merchantDailyActuals.tenantNumber, p.tenantNumber), eq(merchantDailyActuals.month, p.month))
        )
      )
    )
    .groupBy(merchantDailyActuals.tenantNumber, merchantDailyActuals.month);

  const totalsByPair = new Map(
    totals.map((t) => [
      `${t.tenantNumber}|${t.month}`,
      { grossVolume: t.grossVolume, transactionCount: t.transactionCount, aioCommission: t.aioCommission },
    ])
  );

  const updatedAt = new Date();
  const values = pairs.map(({ tenantNumber, month }) => {
    const t = totalsByPair.get(`${tenantNumber}|${month}`);
    return {
      tenantNumber,
      month,
      grossVolume: t?.grossVolume ?? "0",
      transactionCount: t?.transactionCount ?? 0,
      aioCommission: t?.aioCommission ?? "0",
      updatedAt,
    };
  });

  await db
    .insert(merchantMonthlyActuals)
    .values(values)
    .onConflictDoUpdate({
      target: [merchantMonthlyActuals.tenantNumber, merchantMonthlyActuals.month],
      set: {
        grossVolume: sql`excluded.gross_volume`,
        transactionCount: sql`excluded.transaction_count`,
        aioCommission: sql`excluded.aio_commission`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

/**
 * Which of `filenames` have already been ingested — the cron backstop's
 * no-op check, batched into one query instead of one per candidate filename.
 */
export async function getProcessedFilenames(filenames: string[]): Promise<Set<string>> {
  if (filenames.length === 0) return new Set();
  const rows = await db
    .select({ filename: adyenProcessedReports.filename })
    .from(adyenProcessedReports)
    .where(inArray(adyenProcessedReports.filename, filenames));
  return new Set(rows.map((r) => r.filename));
}
