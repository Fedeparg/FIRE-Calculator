/** Margen del dominio "fit", como fracción del valor más alto/bajo del gráfico. */
const FIT_DOMAIN_PADDING_RATIO = 0.01;

const toNumber = (value: unknown): number => (value === undefined ? 0 : Number(value));

/**
 * Dominio del eje de valores ajustado al rango real de los datos, con un 1 % de margen arriba y
 * abajo. Cuenta el total APILADO de cada fila (`stackKeys`) y cada serie superpuesta
 * (`overlayKeys`: líneas y extremos de bandas). Con todos los valores iguales abre un margen
 * alrededor (o de ±1 si son 0); sin datos finitos devuelve `undefined` y el eje se queda en el
 * dominio por defecto.
 *
 * Se calcula a mano porque Recharts fuerza el mínimo de un `Area` apilado a 0 (su baseline)
 * antes de que una función de `domain` pueda tocarlo.
 */
export function fitYDomain<T extends object>(
  data: readonly T[],
  stackKeys: readonly (keyof T & string)[],
  overlayKeys: readonly (keyof T & string)[],
): [number, number] | undefined {
  let min = Infinity;
  let max = -Infinity;
  for (const row of data) {
    const stackTotal = stackKeys.reduce((sum, key) => sum + toNumber(row[key]), 0);
    min = Math.min(min, stackTotal);
    max = Math.max(max, stackTotal);
    for (const key of overlayKeys) {
      const value = toNumber(row[key]);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;
  if (min === max) {
    const pad = Math.abs(max) * FIT_DOMAIN_PADDING_RATIO || 1;
    return [min - pad, max + pad];
  }
  return [min - Math.abs(min) * FIT_DOMAIN_PADDING_RATIO, max + Math.abs(max) * FIT_DOMAIN_PADDING_RATIO];
}
