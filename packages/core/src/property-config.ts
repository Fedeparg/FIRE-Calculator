/**
 * Configuración común de los tests de propiedades (`*.property.test.ts`, con fast-check).
 *
 * Semilla FIJA: un fallo en CI tiene que reproducirse igual en local, y un test que a veces
 * pasa y a veces no es peor que no tenerlo. Para explorar más casos basta con subir `numRuns`
 * o cambiar la semilla en local; si aparece un contraejemplo, se convierte en un test normal.
 */
export const PROPERTY_PARAMS = { seed: 20260928, numRuns: 200 } as const;
