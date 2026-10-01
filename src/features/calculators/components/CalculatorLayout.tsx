type Props = {
  inputs: React.ReactNode;
  /**
   * `sidebar`: pocos campos, barra lateral con los resultados al lado.
   * `grid`: muchos campos, rejilla arriba y resultados debajo (evita una columna
   * lateral kilométrica). Se elige a mano, no se deduce de un recuento de campos,
   * que se desfasaba al añadir o quitar uno.
   */
  layout: "sidebar" | "grid";
  results: React.ReactNode;
  notice?: React.ReactNode;
};

export default function CalculatorLayout({ inputs, layout, results, notice }: Props) {
  return (
    <div className="grid gap-6">
      {notice}

      {layout === "grid" ? (
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
