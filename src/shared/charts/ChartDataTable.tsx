"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export type ChartTableColumn<Row> = {
  /** Column header. */
  label: string;
  /** Already formatted cell text for that row. */
  value: (row: Row) => string;
};

type Props<Row> = {
  /** Chart title; it makes up the table's translated `caption`. */
  title: string;
  columns: readonly ChartTableColumn<Row>[];
  rows: readonly Row[];
};

/**
 * Text alternative to a chart: the same data as a table, for screen readers.
 *
 * WHY A TABLE AND NOT JUST AN `aria-label`: Recharts renders an SVG with no `<title>`, no
 * `<desc>` and no semantic structure, so a screen reader extracts NO data from the chart. A
 * descriptive `aria-label` only solves half of it: it says what the drawing is about but gives
 * no access to the numbers. The table does, and it can also be navigated cell by cell with the
 * screen reader's table commands, the real equivalent of reading the axes. Both are combined:
 * the chart is marked `role="img"` with a short `aria-label` (which keeps the reader from
 * reciting hundreds of SVG nodes) and this table provides the data.
 *
 * It sits inside a closed `<details>` and its body only mounts when opened: with the
 * portfolio's daily history the table would put thousands of cells in every visitor's DOM, even
 * if nobody reads it. The `summary` is visually hidden (`sr-only`) except when it receives
 * keyboard focus, like a "skip to content" link: the layout does not change and keyboard users
 * know where they are.
 */
export default function ChartDataTable<Row>({ title, columns, rows }: Props<Row>) {
  const t = useTranslations("chart");
  const [open, setOpen] = useState(false);

  return (
    <details className="text-xs" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="sr-only cursor-pointer text-muted focus-visible:not-sr-only focus-visible:mt-2 focus-visible:inline-block">
        {t("showData", { title })}
      </summary>
      {open && (
        <div className="sr-only">
          <table>
            <caption>{t("dataTableCaption", { title })}</caption>
            <thead>
              <tr>
                {columns.map((column, columnIndex) => (
                  // The key is the position: two columns may share a name.
                  <th key={columnIndex} scope="col">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((column, columnIndex) =>
                    // The first column is the X axis: as a row header it gives
                    // context to the other cells when navigating the table.
                    columnIndex === 0 ? (
                      <th key={columnIndex} scope="row">
                        {column.value(row)}
                      </th>
                    ) : (
                      <td key={columnIndex}>{column.value(row)}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
