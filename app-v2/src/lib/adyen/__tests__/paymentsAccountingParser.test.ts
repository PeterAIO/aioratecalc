import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  parseCsv,
  parsePaymentsAccountingReport,
  commissionCentsFromSplitData,
  SETTLE_RECORD_TYPE,
} from "../paymentsAccountingParser";

// Synthetic fixture — no real customer data. It encodes every trap the live
// report carries: pre-auth chains, a tip-adjust duplicate at the settle record
// type, staging traffic, multi-item splits, an empty split, a broken split,
// quoted commas inside the JSON field, three stores, and a month boundary
// crossed by a payment whose booking date is the day AFTER its sale date.
const csv = readFileSync(join(__dirname, "fixtures/payments_accounting_report_sample.csv"), "utf8");
const parsed = parsePaymentsAccountingReport(csv);

const actual = (tenantNumber: string, saleDate: string) =>
  parsed.actuals.find((a) => a.tenantNumber === tenantNumber && a.saleDate === saleDate);

describe("parseCsv", () => {
  it("keeps commas and doubled quotes inside a quoted field", () => {
    const rows = parseCsv('a,"b,c","he said ""hi"""\n1,2,3\n');
    expect(rows).toEqual([
      ["a", "b,c", 'he said "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("handles CRLF and a file with no trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("does not shred the Split Payment Data column", () => {
    const settleRows = parseCsv(csv).filter((r) => r[9] === SETTLE_RECORD_TYPE);
    // 11 raw settle rows in the fixture, each still exactly 23 columns wide.
    expect(settleRows).toHaveLength(11);
    for (const row of settleRows) expect(row).toHaveLength(23);
    expect(settleRows[0][22]).toContain('"split.item2.description":"Commission split, tier 1"');
  });
});

describe("commissionCentsFromSplitData", () => {
  it("sums every Commission item regardless of index", () => {
    const cents = commissionCentsFromSplitData(
      '{"split.item1.amount":"2410","split.item1.type":"Remainder","split.item2.amount":"60",' +
        '"split.item2.type":"Commission","split.item3.amount":"15","split.item3.type":"PaymentFee",' +
        '"split.item4.amount":"15","split.item4.type":"Commission","split.nrOfItems":"4"}'
    );
    expect(cents).toBe(75);
  });

  it("reads a Commission item sitting at item1, not just item2", () => {
    expect(
      commissionCentsFromSplitData(
        '{"split.item1.amount":"100","split.item1.type":"Commission","split.item2.amount":"3900","split.item2.type":"BalanceAccount"}'
      )
    ).toBe(100);
  });

  it("returns 0 for a split with no Commission item, null for empty or broken", () => {
    expect(commissionCentsFromSplitData('{"split.item1.amount":"700","split.item1.type":"BalanceAccount"}')).toBe(0);
    expect(commissionCentsFromSplitData("")).toBeNull();
    expect(commissionCentsFromSplitData('{"split.item1.type":}')).toBeNull();
  });
});

describe("parsePaymentsAccountingReport — deduping", () => {
  it("reads every data row but counts only deduped settle rows as payments", () => {
    expect(parsed.rowCount).toBe(20);
    const payments = parsed.actuals.reduce((n, a) => n + a.transactionCount, 0);
    // 20 rows → 7 attributable payments. A raw row count would be ~3x wrong.
    expect(payments).toBe(7);
  });

  it("drops the tip-adjust duplicate at the settle record type", () => {
    expect(parsed.anomalies.duplicateSettleRows).toBe(1);
    // PSP3 settled twice (15.50 then 18.00); only the first is counted.
    expect(actual("4", "2026-08-01")!.grossVolumeCents).toBe(1550 + 3000 + 700);
  });

  it("ignores pre-auth, incremental auth, refused and chargeback rows", () => {
    expect(parsed.anomalies.recordTypeCounts).toEqual({
      Received: 3,
      AuthorisedPending: 1,
      Authorised: 1,
      ReceivedIncrementalAuth: 1,
      SentForSettle: 11,
      Refused: 1,
      Chargeback: 1,
      SentForRefund: 1,
    });
  });

  it("surfaces record types it has no rule for", () => {
    expect(parsed.anomalies.unknownRecordTypes).toEqual(["SentForRefund"]);
  });
});

describe("parsePaymentsAccountingReport — aggregation", () => {
  it("uses Creation Date, so a sale bucketed by booking date would land in the wrong month", () => {
    expect(parsed.dateColumn).toBe("Creation Date");
    // PSP2 was created 2026-07-31 23:55 but booked 2026-08-01.
    const july = actual("562", "2026-07-31")!;
    expect(july.month).toBe("2026-07");
    expect(july.transactionCount).toBe(2);
    expect(july.grossVolumeCents).toBe(12500);
    // No August bucket picked it up.
    expect(actual("562", "2026-08-01")!.grossVolumeCents).toBe(4000);
  });

  it("aggregates volume, count and commission per tenant per day of sale", () => {
    expect(parsed.actuals.map((a) => [a.tenantNumber, a.saleDate, a.month])).toEqual([
      ["562", "2026-07-31", "2026-07"],
      ["4", "2026-08-01", "2026-08"],
      ["562", "2026-08-01", "2026-08"],
      ["1934", "2026-08-01", "2026-08"],
    ]);
    expect(actual("562", "2026-07-31")).toMatchObject({
      transactionCount: 2,
      grossVolumeCents: 12500,
      commissionCents: 325, // 75 (multi-item) + 250 (basic 2-item)
    });
    expect(actual("4", "2026-08-01")).toMatchObject({
      transactionCount: 3,
      grossVolumeCents: 5250,
      commissionCents: 45,
    });
    expect(actual("562", "2026-08-01")).toMatchObject({
      transactionCount: 1,
      grossVolumeCents: 4000,
      commissionCents: 100,
    });
    expect(actual("1934", "2026-08-01")).toMatchObject({
      transactionCount: 1,
      grossVolumeCents: 1234,
      commissionCents: 0, // split JSON is broken; the payment itself is still real
    });
  });

  it("converts minor units to dollars correctly when rolled up to a month", () => {
    const august = parsed.actuals.filter((a) => a.month === "2026-08");
    const commission = august.reduce((n, a) => n + a.commissionCents, 0);
    const volume = august.reduce((n, a) => n + a.grossVolumeCents, 0);
    expect((commission / 100).toFixed(2)).toBe("1.45");
    expect((volume / 100).toFixed(2)).toBe("104.84");
    // Average ticket falls out of the deduped count, not the row count.
    const count = august.reduce((n, a) => n + a.transactionCount, 0);
    expect((volume / 100 / count).toFixed(2)).toBe("20.97");
  });
});

describe("parsePaymentsAccountingReport — anomalies", () => {
  it("never attributes staging traffic to a tenant", () => {
    expect(parsed.anomalies.nonProdStores).toEqual([{ store: "4-stagev2", rows: 1 }]);
    expect(parsed.actuals.some((a) => a.tenantNumber === "4" && a.grossVolumeCents >= 99900)).toBe(false);
  });

  it("counts unattributable and unparseable rows instead of dropping them silently", () => {
    expect(parsed.anomalies.missingStoreRows).toBe(1);
    expect(parsed.anomalies.unparseableAmountRows).toBe(1);
    expect(parsed.anomalies.emptySplitRows).toBe(1);
    expect(parsed.anomalies.unparseableSplitRows).toBe(1);
    expect(parsed.anomalies.noCommissionItemRows).toBe(1);
  });
});

describe("parsePaymentsAccountingReport — header validation", () => {
  it("throws a named error when a required column is absent", () => {
    const noStore = csv
      .split("\n")
      .map((line, i) => (i === 0 ? line.replace(",Store,", ",NotStore,") : line))
      .join("\n");
    expect(() => parsePaymentsAccountingReport(noStore)).toThrow(/"Store" column/);
  });

  it("throws on an empty file", () => {
    expect(() => parsePaymentsAccountingReport("")).toThrow(/no header row/);
  });
});
