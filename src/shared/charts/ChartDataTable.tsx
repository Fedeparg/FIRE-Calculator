"use client";

import { useTranslations } from "next-intl";

export type ChartTableColumn<Row> = {
  /** Cabecera de la columna. */
  label: string;
  /** Texto ya formateado de la celda para esa fila. */
  value: (row: Row) => string;
};

type Props<Row> = {
  /** Título de la gráfica; compone el `caption` traducido de la tabla. */
  title: string;
  columns: readonly ChartTableColumn<Row>[];
  rows: readonly Row[];
};

/**
 * Alternativa textual de una gráfica: los mismos datos como tabla, oculta
 * visualmente pero presente para un lector de pantalla.
 *
 * POR QUÉ UNA TABLA Y NO SOLO UN `aria-label`: Recharts pinta un SVG sin
 * `<title>`, sin `<desc>` y sin estructura semántica, así que hoy un lector de
 * pantalla no extrae NINGÚN dato de la gráfica. Un `aria-label` descriptivo
 * resuelve solo la mitad: dice de qué va el dibujo, pero no da acceso a los
 * números. La tabla sí, y además es navegable celda a celda con los comandos de
 * tabla del lector, que es la experiencia real equivalente a leer los ejes.
 * Ambas cosas se combinan: la gráfica se marca `role="img"` con un `aria-label`
 * corto (lo que evita que el lector recite los cientos de nodos del SVG) y esta
 * tabla aporta los datos. Va con `sr-only` para no duplicar contenido visible.
 */
export default function ChartDataTable<Row>({ title, columns, rows }: Props<Row>) {
  const t = useTranslations("chart");

  return (
    <div className="sr-only">
      <table>
        <caption>{t("dataTableCaption", { title })}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.label} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column, columnIndex) =>
                // La primera columna es el eje X: como cabecera de fila da
                // contexto al resto de celdas al navegar la tabla.
                columnIndex === 0 ? (
                  <th key={column.label} scope="row">
                    {column.value(row)}
                  </th>
                ) : (
                  <td key={column.label}>{column.value(row)}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
