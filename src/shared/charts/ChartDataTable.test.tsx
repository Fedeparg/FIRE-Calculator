import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { defined } from "@sextante/core/assert";

import { renderWithIntl } from "@/test/render";

import ChartDataTable from "./ChartDataTable";

type Row = { year: number; value: number };

const rows: Row[] = Array.from({ length: 3 }, (_, i) => ({ year: 2020 + i, value: i * 100 }));
const columns = [
  { label: "Año", value: (row: Row) => String(row.year) },
  // Two columns with the same header: keying by position does not mix them up.
  { label: "Valor", value: (row: Row) => `${row.value} €` },
  { label: "Valor", value: (row: Row) => `${row.value * 2} €` },
];

describe("ChartDataTable", () => {
  it("does not mount the table until it is opened", () => {
    const { container } = renderWithIntl(<ChartDataTable title="Patrimonio" columns={columns} rows={rows} />);

    expect(screen.getByText("Ver los datos de la gráfica: Patrimonio")).toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();
  });

  it("shows every row and column once opened", () => {
    const { container } = renderWithIntl(<ChartDataTable title="Patrimonio" columns={columns} rows={rows} />);
    const details = defined(container.querySelector("details"));

    details.open = true;
    fireEvent(details, new Event("toggle"));

    expect(screen.getByRole("table", { name: "Datos de la gráfica: Patrimonio" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(rows.length + 1);
    expect(screen.getByRole("rowheader", { name: "2022" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "400 €" })).toBeInTheDocument();
  });
});
