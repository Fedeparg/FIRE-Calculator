type Props = {
  inputs: React.ReactNode;
  inputCount: number;
  results: React.ReactNode;
  notice?: React.ReactNode;
  /** Campos a partir de los cuales se pasa de barra lateral a rejilla horizontal. */
  threshold?: number;
};

/**
 * Pocos campos: barra lateral + resultados al lado; muchos: rejilla arriba y resultados
 * debajo (evita una columna lateral kilométrica).
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
