// Phase G: pure "which report days should the cron backstop check?" helper,
// split out of the cron route so it's unit-testable without a DB/network.
//
// Deliberately does NOT import paymentsAccountingReportFilename from
// adyenReports.ts — that module starts with `import "server-only"`, which
// throws when pulled into a plain Vitest run. The filename format is a
// one-line format string, so it's duplicated here rather than restructuring
// that file to split it out.

export const LOOKBACK_DAYS = 7;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Builds the report filenames for the `days` calendar days ending the day
 * before `today` (today's report won't exist yet — Adyen generates it for a
 * fully-elapsed day). `today` defaults to now but is a parameter so this is
 * deterministic in tests.
 */
export function expectedReportFilenames(today: Date = new Date(), days: number = LOOKBACK_DAYS): string[] {
  const filenames: string[] = [];
  // Anchor at UTC midnight of "today" so day arithmetic can't be pulled into
  // the previous/next day by a local timezone offset.
  const anchor = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  for (let i = 1; i <= days; i++) {
    const day = new Date(anchor - i * 24 * 60 * 60 * 1000);
    filenames.push(
      `payments_accounting_report_${day.getUTCFullYear()}_${pad2(day.getUTCMonth() + 1)}_${pad2(day.getUTCDate())}.csv`
    );
  }
  return filenames;
}
