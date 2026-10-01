type Props = {
  /** Campos de entrada (lista de NumberField/SelectField, sin envoltorio). */
  inputs: React.ReactNode;
  /** Número de campos de entrada. Decide el layout. */
  inputCount: number;
  /** Resultados: stats, gráficas, etc. (gestionan su propia rejilla interna). */
  results: React.ReactNode;
  /** Aviso opcional (p. ej. el de "datos orientativos") que va arriba del todo. */
  notice?: React.ReactNode;
  /**
   * A partir de cuántos campos se pasa del layout vertical (barra lateral) al
   * horizontal (campos en rejilla arriba). Por defecto 5: con pocos campos la
   * barra lateral es cómoda; con muchos, se haría demasiado larga.
   */
  threshold?: number;
};

/**
 * Estructura común de entrada/resultados de una calculadora. Elige el layout de
 * forma programática según cuántos campos haya, para no repetir decisiones de
 * maquetación en cada calculadora:
 *
 * - Pocos campos (≤ threshold): barra lateral vertical de 320 px + resultados al
 *   lado. Ideal cuando la entrada es corta.
 * - Muchos campos (> threshold): campos en una rejilla horizontal arriba +
 *   resultados debajo a todo el ancho. Evita una columna lateral kilométrica.
 */
export default function CalculatorLayout({ inputs, inputCount, results, notice, threshold = 5 }: Props) {
  const horizontal = inputCount > threshold;

  return (
    <div className="grid gap-6">
      {notice}

      {horizontal ? (
        <>
          <div className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2 lg:grid-cols-3">
            {inputs}
          </div>
          <div className="grid gap-6">{results}</div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
          <div className="grid gap-4 rounded-xl border border-border bg-surface p-4 content-start">{inputs}</div>
          <div className="grid gap-6 content-start">{results}</div>
        </div>
      )}
    </div>
  );
}
