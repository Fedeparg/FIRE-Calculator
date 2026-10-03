// Días de calendario en UTC: la lógica vive en `@sextante/core/dates` (la comparten la web y la
// API). Se reexporta aquí con el nombre histórico de la API para no tocar cada import.
export { addDays, isoDay as isoDate, MS_PER_DAY, todayUtc } from '@sextante/core/dates';
