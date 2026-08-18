import { describe, it, expect } from "vitest";
import { expectedReportFilenames, LOOKBACK_DAYS } from "../reportWindow";

describe("expectedReportFilenames", () => {
  it("returns LOOKBACK_DAYS filenames ending yesterday relative to `today`", () => {
    const today = new Date("2026-08-18T12:00:00Z");
    const filenames = expectedReportFilenames(today);

    expect(filenames).toHaveLength(LOOKBACK_DAYS);
    // Most recent expected day is yesterday, not today.
    expect(filenames[0]).toBe("payments_accounting_report_2026_08_17.csv");
    // Oldest is 7 days before today.
    expect(filenames[filenames.length - 1]).toBe("payments_accounting_report_2026_08_11.csv");
  });

  it("never includes today's report", () => {
    const today = new Date("2026-08-18T23:59:00Z");
    const filenames = expectedReportFilenames(today);
    expect(filenames).not.toContain("payments_accounting_report_2026_08_18.csv");
  });

  it("is unaffected by the time-of-day component of `today`", () => {
    const early = expectedReportFilenames(new Date("2026-08-18T00:00:01Z"));
    const late = expectedReportFilenames(new Date("2026-08-18T23:59:59Z"));
    expect(early).toEqual(late);
  });

  it("respects a custom lookback window", () => {
    const filenames = expectedReportFilenames(new Date("2026-08-18T12:00:00Z"), 3);
    expect(filenames).toEqual([
      "payments_accounting_report_2026_08_17.csv",
      "payments_accounting_report_2026_08_16.csv",
      "payments_accounting_report_2026_08_15.csv",
    ]);
  });

  it("crosses a month boundary correctly", () => {
    const filenames = expectedReportFilenames(new Date("2026-09-02T12:00:00Z"), 5);
    expect(filenames).toEqual([
      "payments_accounting_report_2026_09_01.csv",
      "payments_accounting_report_2026_08_31.csv",
      "payments_accounting_report_2026_08_30.csv",
      "payments_accounting_report_2026_08_29.csv",
      "payments_accounting_report_2026_08_28.csv",
    ]);
  });
});
