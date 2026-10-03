import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import DataTable, { type DataTableColumn } from "./DataTable";

type Row = { id: string; name: string; gain: number };

const rows: Row[] = [
  { id: "a", name: "Apple", gain: 12 },
  { id: "b", name: "Bayer", gain: -3 },
];

const columns: DataTableColumn<Row>[] = [
  { key: "name", header: "Valor", rowHeader: true, cell: (row) => row.name },
  {
    key: "gain",
    header: "Ganancia",
    align: "right",
    cellClassName: (row) => (row.gain > 0 ? "text-success" : "text-danger"),
    cell: (row) => row.gain,
  },
];

describe("DataTable", () => {
  it("renders column and row headers, with each cell's alignment and classes", () => {
    render(<DataTable caption="Ventas" columns={columns} rows={rows} rowKey={(r) => r.id} minWidthClass="min-w-0" />);

    const table = screen.getByRole("table", { name: "Ventas" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Valor", "Ganancia"]);
    expect(within(table).getByRole("rowheader", { name: "Apple" })).toBeInTheDocument();
    const gain = within(table).getByRole("cell", { name: "-3" });
    expect(gain).toHaveClass("text-right", "text-danger");
  });

  it("with renderCard adds the mobile card list and hides the table below sm", () => {
    render(
      <DataTable
        caption="Ventas"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        minWidthClass="min-w-0"
        renderCard={(row) => <span>Tarjeta {row.name}</span>}
      />,
    );

    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Tarjeta Apple", "Tarjeta Bayer"]);
    expect(screen.getByRole("table").parentElement).toHaveClass("hidden", "sm:block");
  });

  it("keeps the title screen-reader-only unless asked to show it", () => {
    const { rerender } = render(
      <DataTable caption="Ventas" columns={columns} rows={rows} rowKey={(r) => r.id} minWidthClass="min-w-0" />,
    );
    expect(screen.getByText("Ventas")).toHaveClass("sr-only");

    rerender(
      <DataTable
        caption="Ventas"
        captionVisible
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        minWidthClass="min-w-0"
      />,
    );
    expect(screen.getByText("Ventas")).not.toHaveClass("sr-only");
  });
});
