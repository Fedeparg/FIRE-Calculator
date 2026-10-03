import type { ReactNode } from "react";

/** Una columna: cómo se titula y cómo se pinta cada celda. */
export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  /** Las cifras van a la derecha para que se comparen por unidades. */
  align?: "left" | "right";
  /**
   * Cabecera de fila (`<th scope="row">`): la columna que da nombre a la fila. Así un lector de
   * pantalla anuncia "Apple, Ganancia, +12 €" y no solo "+12 €".
   */
  rowHeader?: boolean;
  cell: (row: T) => ReactNode;
  /** Clases de la celda (color, `tabular-nums`…); por defecto, texto normal. */
  cellClassName?: string | ((row: T) => string);
};

type Props<T> = {
  /** Título de la tabla. Siempre existe para lectores de pantalla; visible solo si `captionVisible`. */
  caption: ReactNode;
  captionVisible?: boolean;
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** Ancho mínimo de la tabla (clase de Tailwind): por debajo, la tabla se desliza en horizontal. */
  minWidthClass: string;
  /** Clases extra de cada fila (p. ej. `align-top` si alguna celda tiene varias líneas). */
  rowClassName?: string;
  /**
   * Tarjeta de cada fila para pantallas estrechas. Si se da, por debajo de `sm` se pinta una
   * lista de tarjetas en vez de la tabla (que obligaría a deslizar para ver las cifras).
   */
  renderCard?: (row: T) => ReactNode;
};

const cellPadding = "px-3 py-2";
const alignClass = (align: DataTableColumn<unknown>["align"]) => (align === "right" ? "text-right" : "");

/**
 * Tabla de datos con columnas declarativas: la cabecera, las filas y la versión en tarjetas
 * salen de la misma lista de columnas, en vez de repetir el `<table>` a mano en cada vista.
 * Es un componente de servidor o de cliente indistintamente: no tiene estado.
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
