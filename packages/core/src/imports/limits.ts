// Límites de una importación. Viven aquí (y no en la API) porque la UI los usa para avisar
// ANTES de subir el fichero y los dos lados deben coincidir.

/** Tamaño máximo del CSV: un export real de años de actividad ronda los 400 kB. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** Máximo de filas de datos de un fichero. */
export const MAX_IMPORT_ROWS = 20_000;
