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

/** Export sintético (valores inventados) con una fila de cada tipo relevante. */
const FIXTURE = readFileSync(resolve(import.meta.dirname, "fixtures/tr-transaction-export.synthetic.csv"), "utf8");

const HEADER_LINE = TRADE_REPUBLIC_HEADER.map((column) => `"${column}"`).join(",");

type RowFields = Partial<Record<(typeof TRADE_REPUBLIC_HEADER)[number], string>>;

/** Construye una fila completa (todas las columnas entrecomilladas) con valores por defecto. */
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
  it("separa campos y registros", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      { line: 1, fields: ["a", "b"] },
      { line: 2, fields: ["1", "2"] },
    ]);
  });

  it("admite comas, comillas escapadas y saltos de línea dentro de comillas", () => {
    const records = parseCsv('"a, b","say ""hi""","l1\nl2"\n"x","y","z"');
    expect(records[0].fields).toEqual(["a, b", 'say "hi"', "l1\nl2"]);
    // La línea del segundo registro cuenta el salto interno del campo anterior.
    expect(records[1].line).toBe(3);
  });

  it("admite CRLF, BOM y falta de salto final, e ignora líneas vacías", () => {
    const records = parseCsv("﻿a,b\r\n\r\n1,2");
    expect(records.map((r) => r.fields)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("conserva campos vacíos entrecomillados", () => {
    expect(parseCsv('"a","","c"')[0].fields).toEqual(["a", "", "c"]);
  });

  it("falla con una comilla sin cerrar", () => {
    expect(() => parseCsv('"a,b\n1,2')).toThrow(CsvSyntaxError);
  });

  it("falla con texto pegado tras la comilla de cierre", () => {
    expect(() => parseCsv('"a"x,b')).toThrow(CsvSyntaxError);
  });
});

describe("parseTradeRepublicCsv — export sintético", () => {
  const result = parseTradeRepublicCsv(FIXTURE);

  it("importa solo compras y ventas, ordenadas por instante", () => {
    expect(result.trades).toHaveLength(10);
    expect(result.trades.filter((t) => t.kind === "buy")).toHaveLength(7);
    expect(result.trades.filter((t) => t.kind === "sell")).toHaveLength(3);
    const instants = result.trades.map((t) => t.executedAt);
    expect(instants).toEqual([...instants].sort());
  });

  it("normaliza cantidad, precio, comisión y fechas", () => {
    const [first, , third] = result.trades;
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
      // Los 3 decimales originales se completan a 6.
      executedAt: "2025-01-15T09:30:00.123000Z",
    });
    expect(third.fees).toBe("1");
    expect(third.executedAt).toBe("2025-02-20T10:00:00.123456Z");
  });

  it("las ventas llevan cantidad positiva y kind sell", () => {
    const sell = result.trades.find((t) => t.externalId.endsWith("e9d3"));
    expect(sell).toMatchObject({ kind: "sell", quantity: "4", price: "60.25", fees: "1" });
  });

  it("acepta la compra antigua sin amount ni fee", () => {
    const legacy = result.trades.find((t) => t.externalId.endsWith("2003a"));
    expect(legacy).toMatchObject({ kind: "buy", quantity: "0.276891", price: "116.762806", fees: "0" });
  });

  it("clasifica la clase de activo", () => {
    const classes = new Set(result.trades.map((t) => t.assetClass));
    expect(classes).toEqual(new Set(["fund", "stock", "derivative"]));
  });

  it("descarta el resto con motivo y avisa del impuesto sin sumarlo", () => {
    const reasons = new Map<string, number>();
    for (const { reason } of result.skipped) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    expect(Object.fromEntries(reasons)).toEqual({
      cash_movement: 7, // CUSTOMER_INBOUND + 2 CARD + 4 TRANSFER
      dividend: 2,
      interest: 1,
      benefit: 2, // SAVEBACK + STOCKPERK
      ipo_subscription: 1,
      migration_pair: 2,
    });
    expect(result.warnings).toEqual([{ code: "trade_tax_ignored", count: 1 }]);
  });

  it("no filtra datos de terceros en ninguna parte del resultado", () => {
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
    // Las operaciones solo tienen los campos del tipo genérico; las filas descartadas, solo línea/tipo/motivo.
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

describe("parseTradeRepublicCsv — filas", () => {
  it("lee nombres con comas y comillas", () => {
    const { trades } = parseTradeRepublicCsv(csv(row({ name: 'ACME, Inc. "Class A"' })));
    expect(trades[0].name).toBe('ACME, Inc. "Class A"');
  });

  it("usa `date` como fecha de operación aunque el día UTC difiera", () => {
    const { trades } = parseTradeRepublicCsv(csv(row({ datetime: "2025-03-01T23:30:00.000000Z", date: "2025-03-02" })));
    expect(trades[0]).toMatchObject({ tradedAt: "2025-03-02", executedAt: "2025-03-01T23:30:00.000000Z" });
  });

  it("ordena bien instantes con 3 y 6 decimales (no por texto crudo)", () => {
    const { trades } = parseTradeRepublicCsv(
      csv(
        row({ datetime: "2025-03-01T10:00:00.5Z", transaction_id: "b" }),
        row({ datetime: "2025-03-01T10:00:00.123456Z", transaction_id: "a" }),
      ),
    );
    expect(trades.map((t) => t.externalId)).toEqual(["a", "b"]);
  });

  it("respeta el orden del fichero ante el mismo instante", () => {
    const { trades } = parseTradeRepublicCsv(csv(row({ transaction_id: "z" }), row({ transaction_id: "a" })));
    expect(trades.map((t) => t.externalId)).toEqual(["z", "a"]);
  });

  it("redondea half-up a 6 decimales", () => {
    const { trades } = parseTradeRepublicCsv(csv(row({ shares: "0.0000005", price: "1.0000004" })));
    expect(trades[0]).toMatchObject({ quantity: "0.000001", price: "1" });
  });

  it("guarda la comisión en valor absoluto", () => {
    const { trades } = parseTradeRepublicCsv(csv(row({ fee: "-1.50" })));
    expect(trades[0].fees).toBe("1.5");
  });

  it("no suma el impuesto y cuenta cuántas operaciones lo traen", () => {
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

  it("descarta con `invalid_row` los signos incoherentes y los números rotos", () => {
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

  it("descarta filas con número de columnas incorrecto", () => {
    const { trades, skipped } = parseTradeRepublicCsv(`${HEADER_LINE}\n"a","b"\n${row({})}\n`);
    expect(trades).toHaveLength(1);
    expect(skipped).toEqual([{ line: 2, type: "", reason: "invalid_row" }]);
  });

  it("descarta una operación repetida por transaction_id", () => {
    const { trades, skipped } = parseTradeRepublicCsv(csv(row({}), row({})));
    expect(trades).toHaveLength(1);
    expect(skipped).toEqual([{ line: 3, type: "BUY", reason: "duplicate_row" }]);
  });

  it("descarta cripto y divisas distintas de EUR", () => {
    const { trades, skipped } = parseTradeRepublicCsv(
      csv(row({ asset_class: "CRYPTO", transaction_id: "a" }), row({ currency: "USD", transaction_id: "b" })),
    );
    expect(trades).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(["crypto", "unsupported_currency"]);
  });

  it("clasifica un asset_class vacío como other", () => {
    const { trades } = parseTradeRepublicCsv(csv(row({ asset_class: "" })));
    expect(trades[0].assetClass).toBe("other");
  });

  it("trata las retiradas de efectivo como movimiento de efectivo", () => {
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

  it("descarta tipos desconocidos sin fallar", () => {
    const { trades, skipped } = parseTradeRepublicCsv(csv(row({ type: "SPIN_OFF" }), row({ transaction_id: "x" })));
    expect(trades).toHaveLength(1);
    expect(skipped).toEqual([{ line: 2, type: "SPIN_OFF", reason: "unknown_type" }]);
  });

  it("acepta CRLF y BOM", () => {
    const text = `﻿${csv(row({})).replaceAll("\n", "\r\n")}`;
    expect(parseTradeRepublicCsv(text).trades).toHaveLength(1);
  });
});

describe("parseTradeRepublicCsv — migraciones", () => {
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

  it("ignora la pareja salida/entrada equilibrada", () => {
    const { trades, skipped, warnings } = parseTradeRepublicCsv(
      // Como en un export real, las dos patas difieren unos milisegundos.
      csv(migration("-3.0", "a"), migration("3.0000000000", "b", { datetime: "2025-03-01T10:15:00.127456Z" })),
    );
    expect(trades).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(["migration_pair", "migration_pair"]);
    expect(warnings).toEqual([]);
  });

  it("avisa de una migración sin pareja", () => {
    const { skipped, warnings } = parseTradeRepublicCsv(csv(migration("-3", "a")));
    expect(skipped).toEqual([{ line: 2, type: "MIGRATION", reason: "migration_unbalanced" }]);
    expect(warnings).toEqual([{ code: "unbalanced_migration", isin: "ZZ00MIGRA004", line: 2 }]);
  });

  it("no empareja migraciones de distinta cantidad o separadas más de un segundo", () => {
    const { warnings } = parseTradeRepublicCsv(
      csv(migration("-3", "a"), migration("2", "b"), migration("3", "c", { datetime: "2025-03-01T10:15:05.123456Z" })),
    );
    expect(warnings).toHaveLength(3);
  });
});

describe("parseTradeRepublicCsv — ampliaciones liberadas", () => {
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

  it("importa la emisión como compra a precio 0, sin comisión", () => {
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

  it("anula la emisión cancelada y conserva la reemisión, como en un export real", () => {
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

  it("una cancelación sin emisión que anular no resta nada", () => {
    const { trades, skipped } = parseTradeRepublicCsv(
      csv(bonus("BONUS_ISSUE_CANCELLED", "-1", "a", "2025-08-13T05:09:14.774Z")),
    );
    expect(trades).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(["bonus_issue_cancelled"]);
  });

  it("no anula una emisión de otra cantidad o posterior a la cancelación", () => {
    const { trades } = parseTradeRepublicCsv(
      csv(
        bonus("BONUS_ISSUE", "3", "a", "2025-07-30T06:25:21.431Z"),
        bonus("BONUS_ISSUE_CANCELLED", "-2", "b", "2025-08-13T05:09:14.774Z"),
        bonus("BONUS_ISSUE", "2", "c", "2025-09-01T05:09:14.774Z"),
      ),
    );
    expect(trades.map((t) => t.externalId)).toEqual(["a", "c"]);
  });

  it("descarta con `invalid_row` una emisión con signo incoherente", () => {
    const { trades, skipped } = parseTradeRepublicCsv(csv(bonus("BONUS_ISSUE", "-1", "a", "2025-07-30T06:25:21.431Z")));
    expect(trades).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(["invalid_row"]);
  });
});

describe("parseTradeRepublicCsv — ficheros inválidos", () => {
  it("falla con un fichero vacío", () => {
    expectParseError("", "EMPTY_FILE");
    expectParseError("\n\n", "EMPTY_FILE");
  });

  it("falla con solo la cabecera", () => {
    expectParseError(`${HEADER_LINE}\n`, "EMPTY_FILE");
  });

  it("falla con una cabecera que no es la de Trade Republic", () => {
    expectParseError('"a","b"\n"1","2"\n', "NOT_TRADE_REPUBLIC");
    // Una columna menos o en otro orden tampoco vale.
    expectParseError(`${TRADE_REPUBLIC_HEADER.slice(1).join(",")}\n${row({})}\n`, "NOT_TRADE_REPUBLIC");
    expectParseError(`${[...TRADE_REPUBLIC_HEADER].reverse().join(",")}\n`, "NOT_TRADE_REPUBLIC");
  });

  it("falla con un CSV mal formado", () => {
    expectParseError(`${HEADER_LINE}\n"unterminated,1\n`, "MALFORMED_CSV");
  });

  it("falla con un fichero binario o ajeno", () => {
    expectParseError("%PDF-1.7\u0000\u0001binary", "NOT_TRADE_REPUBLIC");
  });
});
