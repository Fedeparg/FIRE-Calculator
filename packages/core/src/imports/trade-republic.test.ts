import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseCsv, CsvSyntaxError } from "./csv.js";
import {
  parseTradeRepublicCsv,
  TRADE_REPUBLIC_HEADER,
  TradeRepublicParseError,
  type TradeRepublicParseErrorCode,
} from "./trade-republic.js";
import { itemAt, takeItems } from "../arrays.js";

/** Synthetic export (made-up values) with one row of each relevant type. */
const FIXTURE = readFileSync(resolve(import.meta.dirname, "fixtures/tr-transaction-export.synthetic.csv"), "utf8");

const HEADER_LINE = TRADE_REPUBLIC_HEADER.map((column) => `"${column}"`).join(",");

type RowFields = Partial<Record<(typeof TRADE_REPUBLIC_HEADER)[number], string>>;

/** Builds a full row (every column quoted) with default values. */
function row(fields: RowFields): string {
  const defaults: RowFields = {
    datetime: "2025-03-01T10:15:00.123456Z",
    date: "2025-03-01",
    account_type: "DEFAULT",
    category: "TRADING",
    type: "BUY",
    asset_class: "STOCK",
    name: "Example Corp",
    symbol: "ZZ00STOCK002",
    shares: "10",
    price: "50.5",
    amount: "-505",
    currency: "EUR",
    transaction_id: "00000000-0000-0000-0000-000000000001",
  };
  const merged = { ...defaults, ...fields };
  return TRADE_REPUBLIC_HEADER.map((column) => `"${(merged[column] ?? "").replaceAll('"', '""')}"`).join(",");
}

function csv(...rows: string[]): string {
  return [HEADER_LINE, ...rows].join("\n") + "\n";
}

function expectParseError(text: string, code: TradeRepublicParseErrorCode): void {
  try {
    parseTradeRepublicCsv(text);
  } catch (error) {
    expect(error).toBeInstanceOf(TradeRepublicParseError);
    expect((error as TradeRepublicParseError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

describe("parseCsv", () => {
  it("splits fields and records", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      { line: 1, fields: ["a", "b"] },
      { line: 2, fields: ["1", "2"] },
    ]);
  });

  it("accepts commas, escaped quotes and line breaks inside quotes", () => {
    const records = parseCsv('"a, b","say ""hi""","l1\nl2"\n"x","y","z"');
    expect(itemAt(records, 0).fields).toEqual(["a, b", 'say "hi"', "l1\nl2"]);
    // The second record's line accounts for the line break inside the previous field.
    expect(itemAt(records, 1).line).toBe(3);
  });

  it("accepts CRLF, BOM and a missing trailing newline, and ignores empty lines", () => {
    const records = parseCsv("﻿a,b\r\n\r\n1,2");
    expect(records.map((r) => r.fields)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps quoted empty fields", () => {
    expect(itemAt(parseCsv('"a","","c"'), 0).fields).toEqual(["a", "", "c"]);
  });

  it("fails on an unterminated quote", () => {
    expect(() => parseCsv('"a,b\n1,2')).toThrow(CsvSyntaxError);
  });

  it("fails on text right after the closing quote", () => {
    expect(() => parseCsv('"a"x,b')).toThrow(CsvSyntaxError);
  });
});

describe("parseTradeRepublicCsv — synthetic export", () => {
  const result = parseTradeRepublicCsv(FIXTURE);

  it("imports only buys and sells, sorted by instant", () => {
    expect(result.trades).toHaveLength(10);
    expect(result.trades.filter((t) => t.kind === "buy")).toHaveLength(7);
    expect(result.trades.filter((t) => t.kind === "sell")).toHaveLength(3);
    const instants = result.trades.map((t) => t.executedAt);
    expect(instants).toEqual([...instants].sort());
  });

  it("normalizes quantity, price, fee and dates", () => {
    const [first, , third] = takeItems(result.trades, 3);
    expect(first).toEqual({
      externalId: "00000000-0000-0000-0000-000000006e17",
      isin: "ZZ00EXAMPL01",
      name: "Example World ETF Acc",
      assetClass: "fund",
      kind: "buy",
      quantity: "1.234568",
      price: "81.05",
      fees: "0",
      tradedAt: "2025-01-15",
      // The original 3 decimals are padded to 6.
      executedAt: "2025-01-15T09:30:00.123000Z",
    });
    expect(third.fees).toBe("1");
    expect(third.executedAt).toBe("2025-02-20T10:00:00.123456Z");
  });

  it("sells carry a positive quantity and kind sell", () => {
    const sell = result.trades.find((t) => t.externalId.endsWith("e9d3"));
    expect(sell).toMatchObject({ kind: "sell", quantity: "4", price: "60.25", fees: "1" });
  });

  it("accepts the old buy without amount or fee", () => {
    const legacy = result.trades.find((t) => t.externalId.endsWith("2003a"));
    expect(legacy).toMatchObject({ kind: "buy", quantity: "0.276891", price: "116.762806", fees: "0" });
  });

  it("classifies the asset class", () => {
    const classes = new Set(result.trades.map((t) => t.assetClass));
    expect(classes).toEqual(new Set(["fund", "stock", "derivative"]));
  });

  it("skips the rest with a reason and warns about the tax without adding it", () => {
    const reasons = new Map<string, number>();
    for (const { reason } of result.skipped) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    expect(Object.fromEntries(reasons)).toEqual({
      cash_movement: 7, // CUSTOMER_INBOUND + 2 CARD + 4 TRANSFER
      ipo_subscription: 1,
      migration_pair: 2,
    });
    expect(result.warnings).toEqual([{ code: "trade_tax_ignored", count: 1 }]);
  });

  it("imports interest and rewards as payouts, reported to the AEAT after the switch to the Spanish branch", () => {
    // The fixture's custody migration is on 2025-06-06: TR reports everything after it.
    expect(result.income).toEqual([
      // Before the migration: `tax` is only the withholding at source.
      expect.objectContaining({ kind: "dividend", paidAt: "2025-05-05", gross: "2.55", withholdingOrigin: "0.45" }),
      // No withholding and an issuer with no known rate: the source withholding stays unknown.
      expect.objectContaining({
        kind: "dividend",
        paidAt: "2025-05-20",
        withholdingOrigin: null,
        reportedToAeat: false,
      }),
      expect.objectContaining({
        kind: "interest",
        paidAt: "2025-06-30",
        gross: "3.1",
        withholdingOrigin: "0",
        withholdingSpain: "0.5",
        country: "ES",
        reportedToAeat: true,
      }),
      expect.objectContaining({ kind: "benefit", paidAt: "2025-07-01", gross: "1", withholdingSpain: "0" }),
      expect.objectContaining({ kind: "benefit", paidAt: "2025-09-02", gross: "15", reportedToAeat: true }),
    ]);
  });

  it("does not leak third-party data anywhere in the result", () => {
    const serialized = JSON.stringify(result);
    for (const leaked of [
      "Jane Doe",
      "John Roe",
      "ES0000000000000000000000",
      "ES1111111111111111111111",
      "Example Shop",
      "5411",
    ]) {
      expect(serialized).not.toContain(leaked);
    }
    for (const item of result.income) {
      expect(Object.keys(item).sort()).toEqual([
        "country",
        "currency",
        "externalId",
        "gross",
        "grossSource",
        "isin",
        "kind",
        "name",
        "originalAmount",
        "originalCurrency",
        "paidAt",
        "quantity",
        "reportedToAeat",
        "withholdingOrigin",
        "withholdingOriginSource",
        "withholdingSpain",
      ]);
    }
    // Trades only have the generic type's fields; skipped rows, only line/type/reason.
    for (const trade of result.trades) {
      expect(Object.keys(trade).sort()).toEqual([
        "assetClass",
        "executedAt",
        "externalId",
        "fees",
        "isin",
        "kind",
        "name",
        "price",
        "quantity",
        "tradedAt",
      ]);
    }
    for (const skippedRow of result.skipped) {
      expect(Object.keys(skippedRow).sort()).toEqual(["line", "reason", "type"]);
    }
  });
});

describe("parseTradeRepublicCsv — rows", () => {
  it("reads names with commas and quotes", () => {
    const { trades } = parseTradeRepublicCsv(csv(row({ name: 'ACME, Inc. "Class A"' })));
    expect(itemAt(trades, 0).name).toBe('ACME, Inc. "Class A"');
  });

  it("uses `date` as the trade date even if the UTC day differs", () => {
    const { trades } = parseTradeRepublicCsv(csv(row({ datetime: "2025-03-01T23:30:00.000000Z", date: "2025-03-02" })));
    expect(trades[0]).toMatchObject({ tradedAt: "2025-03-02", executedAt: "2025-03-01T23:30:00.000000Z" });
  });

  it("sorts instants with 3 and 6 decimals correctly (not by raw text)", () => {
    const { trades } = parseTradeRepublicCsv(
      csv(
        row({ datetime: "2025-03-01T10:00:00.5Z", transaction_id: "b" }),
        row({ datetime: "2025-03-01T10:00:00.123456Z", transaction_id: "a" }),
      ),
    );
    expect(trades.map((t) => t.externalId)).toEqual(["a", "b"]);
  });

  it("keeps file order for the same instant", () => {
    const { trades } = parseTradeRepublicCsv(csv(row({ transaction_id: "z" }), row({ transaction_id: "a" })));
    expect(trades.map((t) => t.externalId)).toEqual(["z", "a"]);
  });

  it("rounds half-up to 6 decimals", () => {
    const { trades } = parseTradeRepublicCsv(csv(row({ shares: "0.0000005", price: "1.0000004" })));
    expect(trades[0]).toMatchObject({ quantity: "0.000001", price: "1" });
  });

  it("stores the fee as an absolute value", () => {
    const { trades } = parseTradeRepublicCsv(csv(row({ fee: "-1.50" })));
    expect(itemAt(trades, 0).fees).toBe("1.5");
  });

  it("does not add the tax and counts how many trades carry it", () => {
    const { trades, warnings } = parseTradeRepublicCsv(
      csv(
        row({ tax: "-0.45", transaction_id: "a" }),
        row({ tax: "-0.10", transaction_id: "b" }),
        row({ tax: "", transaction_id: "c" }),
      ),
    );
    expect(trades.map((t) => t.fees)).toEqual(["0", "0", "0"]);
    expect(warnings).toEqual([{ code: "trade_tax_ignored", count: 2 }]);
  });

  it("skips inconsistent signs and broken numbers as `invalid_row`", () => {
    const { trades, skipped } = parseTradeRepublicCsv(
      csv(
        row({ type: "BUY", shares: "-1", transaction_id: "a" }),
        row({ type: "SELL", shares: "1", transaction_id: "b" }),
        row({ shares: "0", transaction_id: "c" }),
        row({ shares: "1e3", transaction_id: "d" }),
        row({ shares: "1,5", transaction_id: "e" }),
        row({ price: "", transaction_id: "f" }),
        row({ price: "-1", transaction_id: "g" }),
        row({ symbol: "short", transaction_id: "h" }),
        row({ date: "2025-02-31", transaction_id: "i" }),
        row({ datetime: "yesterday", transaction_id: "j" }),
        row({ transaction_id: "" }),
      ),
    );
    expect(trades).toEqual([]);
    expect(skipped).toHaveLength(11);
    expect(new Set(skipped.map((s) => s.reason))).toEqual(new Set(["invalid_row"]));
  });

  it("skips rows with the wrong number of columns", () => {
    const { trades, skipped } = parseTradeRepublicCsv(`${HEADER_LINE}\n"a","b"\n${row({})}\n`);
    expect(trades).toHaveLength(1);
    expect(skipped).toEqual([{ line: 2, type: "", reason: "invalid_row" }]);
  });

  it("skips a trade repeated by transaction_id", () => {
    const { trades, skipped } = parseTradeRepublicCsv(csv(row({}), row({})));
    expect(trades).toHaveLength(1);
    expect(skipped).toEqual([{ line: 3, type: "BUY", reason: "duplicate_row" }]);
  });

  it("skips crypto and currencies other than EUR", () => {
    const { trades, skipped } = parseTradeRepublicCsv(
      csv(row({ asset_class: "CRYPTO", transaction_id: "a" }), row({ currency: "USD", transaction_id: "b" })),
    );
    expect(trades).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(["crypto", "unsupported_currency"]);
  });

  it("classifies an empty asset_class as other", () => {
    const { trades } = parseTradeRepublicCsv(csv(row({ asset_class: "" })));
    expect(itemAt(trades, 0).assetClass).toBe("other");
  });

  it("treats cash withdrawals as a cash movement", () => {
    const { skipped } = parseTradeRepublicCsv(
      csv(
        row({
          type: "CUSTOMER_OUTBOUND_REQUEST",
          category: "CASH",
          asset_class: "",
          symbol: "",
          shares: "",
          price: "",
        }),
      ),
    );
    expect(skipped.map((s) => s.reason)).toEqual(["cash_movement"]);
  });

  it("skips unknown types without failing", () => {
    const { trades, skipped } = parseTradeRepublicCsv(csv(row({ type: "SPIN_OFF" }), row({ transaction_id: "x" })));
    expect(trades).toHaveLength(1);
    expect(skipped).toEqual([{ line: 2, type: "SPIN_OFF", reason: "unknown_type" }]);
  });

  it("accepts CRLF and BOM", () => {
    const text = `﻿${csv(row({})).replaceAll("\n", "\r\n")}`;
    expect(parseTradeRepublicCsv(text).trades).toHaveLength(1);
  });
});

describe("parseTradeRepublicCsv — payouts", () => {
  const interest = (date: string, amount: string, tax: string, id: string) =>
    row({
      date,
      datetime: `${date}T22:00:00.000000Z`,
      category: "CASH",
      type: "INTEREST_PAYMENT",
      asset_class: "",
      name: "",
      symbol: "",
      shares: "",
      price: "",
      amount,
      tax,
      transaction_id: id,
    });
  const saveback = (date: string, amount: string, tax: string, id: string) =>
    row({
      date,
      datetime: `${date}T05:00:00.000000Z`,
      category: "CASH",
      type: "BENEFITS_SAVEBACK",
      asset_class: "FUND",
      shares: "",
      price: "",
      amount,
      tax,
      transaction_id: id,
    });
  const migration = (date: string, shares: string, id: string) =>
    row({
      date,
      datetime: `${date}T09:00:00.000000Z`,
      category: "DELIVERY",
      type: "MIGRATION",
      shares,
      price: "",
      amount: "",
      transaction_id: id,
    });

  it("takes a saveback's withholding from the buy that invests it (same day and amount) and does not warn about it", () => {
    const { income, trades, warnings } = parseTradeRepublicCsv(
      csv(
        saveback("2025-08-04", "13.350000", "", "s1"),
        row({
          date: "2025-08-04",
          datetime: "2025-08-04T07:00:00.000000Z",
          shares: "0.144371",
          price: "92.47",
          amount: "-13.35",
          tax: "-2.54",
          transaction_id: "b1",
        }),
        row({
          date: "2025-08-05",
          datetime: "2025-08-05T07:00:00.000000Z",
          amount: "-100",
          tax: "-1.00",
          transaction_id: "b2",
        }),
      ),
    );
    expect(income).toEqual([expect.objectContaining({ kind: "benefit", gross: "13.35", withholdingSpain: "2.54" })]);
    // The saveback buy is imported all the same, with its cost.
    expect(trades.map((t) => t.externalId)).toEqual(["b1", "b2"]);
    expect(warnings).toEqual([{ code: "trade_tax_ignored", count: 1 }]);
  });

  it("marks as reported what comes after the migration to the Spanish branch, not the same day or earlier", () => {
    const { income } = parseTradeRepublicCsv(
      csv(
        interest("2025-06-01", "4.10", "", "i1"),
        migration("2025-06-06", "-1", "m1"),
        migration("2025-06-06", "1", "m2"),
        interest("2025-06-06", "0.20", "", "i2"),
        interest("2025-06-30", "1.50", "-0.29", "i3"),
      ),
    );
    expect(income.map((i) => [i.externalId, i.reportedToAeat, i.country])).toEqual([
      ["i1", false, "DE"],
      ["i2", false, "DE"],
      ["i3", true, "ES"],
    ]);
  });

  it("reported interest paid on the 1st counts on the last day of the previous month, as in the draft return", () => {
    const { income } = parseTradeRepublicCsv(
      csv(
        interest("2025-06-01", "4.10", "", "i1"),
        migration("2025-06-06", "-1", "m1"),
        migration("2025-06-06", "1", "m2"),
        interest("2026-01-01", "1.57", "-0.30", "i2"),
        saveback("2025-12-01", "15.000000", "-2.85", "s1"),
      ),
    );
    expect(income.map((i) => [i.externalId, i.paidAt])).toEqual([
      ["i1", "2025-06-01"],
      ["s1", "2025-12-01"],
      ["i2", "2025-12-31"],
    ]);
  });

  it("without a migration, the account is Spanish from the first interest payment with withholding", () => {
    const { income } = parseTradeRepublicCsv(
      csv(
        interest("2025-01-01", "1.00", "", "i1"),
        interest("2025-02-01", "2.00", "-0.38", "i2"),
        interest("2025-03-01", "0.01", "", "i3"),
      ),
    );
    expect(income.map((i) => i.reportedToAeat)).toEqual([false, true, true]);
  });

  it("with no sign of a Spanish account, nothing is reported", () => {
    const { income } = parseTradeRepublicCsv(csv(interest("2025-01-01", "1.00", "", "i1")));
    expect(income[0]).toMatchObject({ reportedToAeat: false, country: "DE", withholdingSpain: "0" });
  });

  const dividend = (date: string, isin: string, amount: string, tax: string, id: string) =>
    row({
      date,
      datetime: `${date}T06:00:00.000000Z`,
      category: "CASH",
      type: "DIVIDEND",
      symbol: isin,
      shares: "1",
      price: "",
      amount,
      tax,
      transaction_id: id,
    });
  const afterMigration = (...rows: string[]) =>
    csv(migration("2025-06-06", "-1", "m1"), migration("2025-06-06", "1", "m2"), ...rows);

  it("after the migration, a US dividend carries the gross amount and both withholdings together in `tax`", () => {
    // TR tax report: gross 0.22, source 0.03, Spain 0.04.
    const { income } = parseTradeRepublicCsv(
      afterMigration(dividend("2025-08-14", "US0378331005", "0.22", "-0.07", "d1")),
    );
    expect(income[0]).toMatchObject({
      kind: "dividend",
      isin: "US0378331005",
      country: "US",
      gross: "0.22",
      withholdingOrigin: "0.03",
      withholdingSpain: "0.04",
      reportedToAeat: true,
      grossSource: "broker",
      withholdingOriginSource: "derived",
    });
  });

  it("after the migration, a Dutch dividend arrives net of source withholding and `tax` is only the Spanish one", () => {
    // TR tax report: gross 1.60, source 0.24, Spain 0.26 (ASML).
    const { income } = parseTradeRepublicCsv(
      afterMigration(dividend("2025-08-06", "NL0010273215", "1.36", "-0.26", "d1")),
    );
    // Grossing up the net amount at 15% is an estimate until market data confirms it.
    expect(income[0]).toMatchObject({
      gross: "1.6",
      withholdingOrigin: "0.24",
      withholdingSpain: "0.26",
      grossSource: "estimate",
      withholdingOriginSource: "estimate",
      quantity: "1",
    });
  });

  it("before the migration `tax` is the withholding at source", () => {
    const { income } = parseTradeRepublicCsv(csv(dividend("2025-05-15", "US0378331005", "0.11", "-0.02", "d1")));
    expect(income[0]).toMatchObject({
      gross: "0.11",
      withholdingOrigin: "0.02",
      withholdingSpain: "0",
      reportedToAeat: false,
    });
  });

  it("does not derive the source withholding for countries where it is not the treaty rate, nor from figures that do not fit", () => {
    const { income } = parseTradeRepublicCsv(
      afterMigration(
        dividend("2025-09-01", "CH0038863350", "10.00", "-1.90", "d1"),
        dividend("2025-09-02", "US0378331005", "10.00", "-2.50", "d2"),
      ),
    );
    expect(income.map((i) => [i.withholdingOrigin, i.withholdingSpain])).toEqual([
      [null, "1.9"],
      // Neither 15%, nor 19%, nor 31.15%: the Spanish one cannot exceed 19% of the amount paid.
      [null, "1.9"],
    ]);
  });

  it("a tiny dividend without withholding has a 0 source withholding, not an unknown one", () => {
    const { income } = parseTradeRepublicCsv(afterMigration(dividend("2025-07-03", "US67066G1040", "0.01", "", "d1")));
    expect(income[0]).toMatchObject({ withholdingOrigin: "0", withholdingSpain: "0" });
  });

  it("skips a provisional dividend and its reversal, and keeps the final one", () => {
    const { income, skipped } = parseTradeRepublicCsv(
      csv(
        dividend("2025-07-29", "CNE100000296", "1.47", "", "d1"),
        dividend("2025-08-12", "CNE100000296", "-1.47", "", "d2"),
        dividend("2025-08-12", "CNE100000296", "1.44", "", "d3"),
      ),
    );
    expect(income.map((i) => [i.externalId, i.gross, i.withholdingOrigin])).toEqual([["d3", "1.44", null]]);
    expect(skipped.map((s) => s.reason)).toEqual(["dividend_reversed", "dividend_reversed"]);
  });

  it("skips payouts with an invalid amount, a non-euro currency or duplicates", () => {
    const { income, skipped } = parseTradeRepublicCsv(
      csv(
        interest("2025-01-01", "abc", "", "i1"),
        row({
          date: "2025-01-02",
          datetime: "2025-01-02T22:00:00.000000Z",
          category: "CASH",
          type: "INTEREST_PAYMENT",
          asset_class: "",
          symbol: "",
          shares: "",
          price: "",
          amount: "1",
          currency: "USD",
          transaction_id: "i2",
        }),
        interest("2025-01-03", "1.00", "", "i3"),
        interest("2025-01-03", "1.00", "", "i3"),
      ),
    );
    expect(income.map((i) => i.externalId)).toEqual(["i3"]);
    expect(skipped.map((s) => s.reason)).toEqual(["invalid_row", "invalid_row", "duplicate_row"]);
  });
});

describe("parseTradeRepublicCsv — migrations", () => {
  const migration = (shares: string, id: string, extra: RowFields = {}): string =>
    row({
      type: "MIGRATION",
      category: "DELIVERY",
      asset_class: "FUND",
      symbol: "ZZ00MIGRA004",
      shares,
      price: "200",
      amount: "",
      transaction_id: id,
      ...extra,
    });

  it("ignores the balanced outbound/inbound pair", () => {
    const { trades, skipped, warnings } = parseTradeRepublicCsv(
      // As in a real export, the two legs differ by a few milliseconds.
      csv(migration("-3.0", "a"), migration("3.0000000000", "b", { datetime: "2025-03-01T10:15:00.127456Z" })),
    );
    expect(trades).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(["migration_pair", "migration_pair"]);
    expect(warnings).toEqual([]);
  });

  it("warns about an unpaired migration", () => {
    const { skipped, warnings } = parseTradeRepublicCsv(csv(migration("-3", "a")));
    expect(skipped).toEqual([{ line: 2, type: "MIGRATION", reason: "migration_unbalanced" }]);
    expect(warnings).toEqual([{ code: "unbalanced_migration", isin: "ZZ00MIGRA004", line: 2 }]);
  });

  it("does not pair migrations with different quantities or more than one second apart", () => {
    const { warnings } = parseTradeRepublicCsv(
      csv(migration("-3", "a"), migration("2", "b"), migration("3", "c", { datetime: "2025-03-01T10:15:05.123456Z" })),
    );
    expect(warnings).toHaveLength(3);
  });
});

describe("parseTradeRepublicCsv — bonus issues", () => {
  const bonus = (type: string, shares: string, id: string, datetime: string): string =>
    row({
      type,
      category: "CORPORATE_ACTION",
      symbol: "ZZ00BONUS005",
      shares,
      price: "",
      amount: "",
      currency: "",
      transaction_id: id,
      datetime,
      date: datetime.slice(0, 10),
    });

  it("imports the issue as a buy at price 0, with no fee", () => {
    const { trades, skipped } = parseTradeRepublicCsv(
      csv(bonus("BONUS_ISSUE", "2.5", "a", "2025-07-30T06:25:21.431Z")),
    );
    expect(trades).toEqual([
      expect.objectContaining({
        externalId: "a",
        isin: "ZZ00BONUS005",
        kind: "buy",
        quantity: "2.5",
        price: "0",
        fees: "0",
        tradedAt: "2025-07-30",
      }),
    ]);
    expect(skipped).toEqual([]);
  });

  it("voids the cancelled issue and keeps the reissue, as in a real export", () => {
    const { trades, skipped } = parseTradeRepublicCsv(
      csv(
        bonus("BONUS_ISSUE", "2.76243", "a", "2025-07-30T06:25:21.431Z"),
        bonus("BONUS_ISSUE", "4.143646", "b", "2025-07-30T06:25:35.095Z"),
        bonus("BONUS_ISSUE_CANCELLED", "-2.76243", "c", "2025-08-13T05:09:14.774Z"),
        bonus("BONUS_ISSUE", "2.76243", "d", "2025-08-13T05:22:45.443Z"),
      ),
    );
    expect(trades.map((t) => [t.externalId, t.quantity])).toEqual([
      ["b", "4.143646"],
      ["d", "2.76243"],
    ]);
    expect(skipped.map((s) => [s.line, s.reason])).toEqual([
      [2, "bonus_issue_cancelled"],
      [4, "bonus_issue_cancelled"],
    ]);
  });

  it("a cancellation with no issue to void subtracts nothing", () => {
    const { trades, skipped } = parseTradeRepublicCsv(
      csv(bonus("BONUS_ISSUE_CANCELLED", "-1", "a", "2025-08-13T05:09:14.774Z")),
    );
    expect(trades).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(["bonus_issue_cancelled"]);
  });

  it("does not void an issue with a different quantity or later than the cancellation", () => {
    const { trades } = parseTradeRepublicCsv(
      csv(
        bonus("BONUS_ISSUE", "3", "a", "2025-07-30T06:25:21.431Z"),
        bonus("BONUS_ISSUE_CANCELLED", "-2", "b", "2025-08-13T05:09:14.774Z"),
        bonus("BONUS_ISSUE", "2", "c", "2025-09-01T05:09:14.774Z"),
      ),
    );
    expect(trades.map((t) => t.externalId)).toEqual(["a", "c"]);
  });

  it("skips an issue with an inconsistent sign as `invalid_row`", () => {
    const { trades, skipped } = parseTradeRepublicCsv(csv(bonus("BONUS_ISSUE", "-1", "a", "2025-07-30T06:25:21.431Z")));
    expect(trades).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(["invalid_row"]);
  });
});

describe("parseTradeRepublicCsv — invalid files", () => {
  it("fails on an empty file", () => {
    expectParseError("", "EMPTY_FILE");
    expectParseError("\n\n", "EMPTY_FILE");
  });

  it("fails with only the header", () => {
    expectParseError(`${HEADER_LINE}\n`, "EMPTY_FILE");
  });

  it("fails with a header that is not Trade Republic's", () => {
    expectParseError('"a","b"\n"1","2"\n', "NOT_TRADE_REPUBLIC");
    // One column fewer or a different order is not valid either.
    expectParseError(`${TRADE_REPUBLIC_HEADER.slice(1).join(",")}\n${row({})}\n`, "NOT_TRADE_REPUBLIC");
    expectParseError(`${[...TRADE_REPUBLIC_HEADER].reverse().join(",")}\n`, "NOT_TRADE_REPUBLIC");
  });

  it("fails on a malformed CSV", () => {
    expectParseError(`${HEADER_LINE}\n"unterminated,1\n`, "MALFORMED_CSV");
  });

  it("fails on a binary or unrelated file", () => {
    expectParseError("%PDF-1.7\u0000\u0001binary", "NOT_TRADE_REPUBLIC");
  });
});
