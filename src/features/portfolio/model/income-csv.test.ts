import { describe, expect, it } from "vitest";

import type { IncomeEvent } from "@sextante/core/fiscal/income";
import { buildIncomeCsv, INCOME_CSV_COLUMNS, type IncomeCsvHeaders } from "./income-csv";

const HEADERS = Object.fromEntries(INCOME_CSV_COLUMNS.map((c) => [c, c])) as IncomeCsvHeaders;
const LABELS = { kind: (k: string) => k, source: (s: string) => s, yes: "sí", no: "no" };

const event = (overrides: Partial<IncomeEvent>): IncomeEvent => ({
  id: "e",
  positionId: null,
  kind: "dividend",
  paidAt: "2025-08-06",
  isin: "NL0010273215",
  name: "ASML",
  country: "NL",
  currency: "EUR",
  gross: 1.6,
  withholdingOrigin: 0.24,
  withholdingSpain: 0.26,
  reportedToAeat: true,
  source: "trade_republic",
  grossSource: "market",
  withholdingOriginSource: "market",
  quantity: 1,
  originalAmount: null,
  originalCurrency: null,
  createdAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("buildIncomeCsv", () => {
  it("una fila por cobro, ordenadas por fecha, con la procedencia y la retención desconocida vacía", () => {
    const csv = buildIncomeCsv(
      [
        event({}),
        event({
          paidAt: "2025-07-01",
          kind: "interest",
          isin: null,
          name: null,
          country: "ES",
          gross: 1.5,
          withholdingOrigin: null,
          withholdingOriginSource: null,
          withholdingSpain: 0.29,
          grossSource: "broker",
        }),
      ],
      HEADERS,
      LABELS,
      "es",
    );
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(INCOME_CSV_COLUMNS.join(";"));
    expect(lines[1]).toBe("2025-07-01;interest;;;ES;EUR;1,5;;0,29;sí;broker;");
    expect(lines[2]).toBe("2025-08-06;dividend;ASML;NL0010273215;NL;EUR;1,6;0,24;0,26;sí;market;market");
  });
});
