// UTC calendar days: the logic lives in `@sextante/core/dates` (shared by the web app and the
// API). It is re-exported here under the API's historical name so no import has to change.
export { addDays, isoDay as isoDate, MS_PER_DAY, todayUtc } from '@sextante/core/dates';
