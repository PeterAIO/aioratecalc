import { NextRequest, NextResponse } from "next/server";
import { downloadReport, AdyenReportError } from "@/lib/adapters/adyenReports";
import { parsePaymentsAccountingReport } from "@/lib/adyen/paymentsAccountingParser";
import { ingestPaymentsAccountingReport, getProcessedFilenames } from "@/lib/adyen/actualsIngest";
import { expectedReportFilenames } from "@/lib/adyen/reportWindow";

// Phase G nightly cron backstop. Report filenames are predictable
// (`payments_accounting_report_{yyyy_MM_dd}.csv`), so instead of relying on
// the webhook (whose notification surface isn't confirmed yet), this walks
// the last LOOKBACK_DAYS expected report days, skips ones already ingested,
// and fetches+ingests the rest. A 404 just means Adyen hasn't generated that
// day's report yet — not an error, and not worth retrying tonight since
// tomorrow's run is the retry.
//
// A cold backfill (all LOOKBACK_DAYS days missing) can mean several
// sequential downloads + ingests, each with their own network+DB round
// trips, so this raises Vercel's function timeout above the 10s/60s
// defaults (Fluid Compute allows up to 300s on non-Enterprise plans).
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron adyen-actuals] CRON_SECRET not set");
    return NextResponse.json({ error: "not configured" }, { status: 401 });
  }
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const filenames = expectedReportFilenames();
  const alreadyProcessed = await getProcessedFilenames(filenames);

  const ingested: string[] = [];
  const notYetAvailable: string[] = [];
  const failed: { filename: string; error: string }[] = [];
  let skippedAlreadyProcessed = 0;

  for (const filename of filenames) {
    if (alreadyProcessed.has(filename)) {
      skippedAlreadyProcessed++;
      continue;
    }

    try {
      const csv = await downloadReport(filename);
      const parsed = parsePaymentsAccountingReport(csv);
      await ingestPaymentsAccountingReport(filename, parsed);
      ingested.push(filename);
    } catch (err) {
      if (err instanceof AdyenReportError && err.kind === "not_found") {
        notYetAvailable.push(filename);
        continue;
      }
      failed.push({ filename, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const summary = {
    checked: filenames.length,
    ingested,
    notYetAvailable,
    failed,
    skippedAlreadyProcessed,
  };

  return NextResponse.json(summary, { status: failed.length > 0 ? 500 : 200 });
}
