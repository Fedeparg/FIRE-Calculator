import type { ReactNode } from "react";

/** A column: its header and how each cell is rendered. */
export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  /** Figures are right-aligned so they compare digit by digit. */
  align?: "left" | "right";
  /**
   * Row header (`<th scope="row">`): the column that names the row. This way a screen reader
   * announces "Apple, Gain, +12 €" and not just "+12 €".
   */
  rowHeader?: boolean;
  cell: (row: T) => ReactNode;
  /** Cell classes (color, `tabular-nums`…); regular text by default. */
  cellClassName?: string | ((row: T) => string);
};

type Props<T> = {
  /** Table title. Always present for screen readers; visible only if `captionVisible`. */
  caption: ReactNode;
  captionVisible?: boolean;
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** Minimum table width (a Tailwind class): below it, the table scrolls horizontally. */
  minWidthClass: string;
  /** Extra classes per row (e.g. `align-top` if a cell spans several lines). */
  rowClassName?: string;
  /**
   * Card for each row on narrow screens. If given, below `sm` a list of cards is rendered
   * instead of the table (which would force horizontal scrolling to see the figures).
   */
  renderCard?: (row: T) => ReactNode;
};

const cellPadding = "px-3 py-2";
const alignClass = (align: DataTableColumn<unknown>["align"]) => (align === "right" ? "text-right" : "");

/**
 * Data table with declarative columns: the header, the rows and the card version all come from
 * the same column list, instead of hand-writing the `<table>` in every view. It works as either
 * a server or a client component: it has no state.
 */
export default function DataTable<T>({
  caption,
  captionVisible = false,
  columns,
  rows,
  rowKey,
  minWidthClass,
  rowClassName = "",
  renderCard,
}: Props<T>) {
  return (
    <>
      {renderCard && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border sm:hidden">
          {rows.map((row) => (
            <li key={rowKey(row)} className="flex flex-col gap-2 p-3 text-sm">
              {renderCard(row)}
            </li>
          ))}
        </ul>
      )}

      <div className={`overflow-x-auto rounded-lg border border-border ${renderCard ? "hidden sm:block" : ""}`}>
        <table className={`w-full ${minWidthClass} text-left text-sm`}>
          <caption className={captionVisible ? "px-3 pt-3 text-left text-xs text-muted" : "sr-only"}>{caption}</caption>
          <thead>
            <tr className="border-b border-border text-muted">
              {columns.map((column) => (
                <th key={column.key} scope="col" className={`${cellPadding} font-medium ${alignClass(column.align)}`}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className={`border-b border-border last:border-0 ${rowClassName}`}>
                {columns.map((column) => {
                  const extra =
                    typeof column.cellClassName === "function" ? column.cellClassName(row) : column.cellClassName;
                  const className = `${cellPadding} ${alignClass(column.align)} ${extra ?? ""}`;
                  return column.rowHeader ? (
                    <th key={column.key} scope="row" className={`${className} font-normal`}>
                      {column.cell(row)}
                    </th>
                  ) : (
                    <td key={column.key} className={className}>
                      {column.cell(row)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
