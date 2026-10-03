import { describe, expect, it } from 'vitest';

import { parseEcbCsv } from './ecb-reference-rates.provider.js';

const HEADER = 'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE';

describe('parseEcbCsv', () => {
  it('reads currency, date and value by column name', () => {
    const csv = [
      HEADER,
      'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10-01,1.1298',
      'EXR.D.CHF.EUR.SP00.A,D,CHF,EUR,SP00,A,2026-10-01,0.9316',
      '',
    ].join('\r\n');
    expect(parseEcbCsv(csv)).toEqual([
      { currency: 'USD', date: '2026-10-01', unitsPerEur: 1.1298 },
      { currency: 'CHF', date: '2026-10-01', unitsPerEur: 0.9316 },
    ]);
  });

  it('does not depend on the column order', () => {
    const csv = ['TIME_PERIOD,OBS_VALUE,CURRENCY', '2026-10-01,1.1298,USD'].join('\n');
    expect(parseEcbCsv(csv)).toEqual([{ currency: 'USD', date: '2026-10-01', unitsPerEur: 1.1298 }]);
  });

  it('drops rows with an empty, non-numeric or non-positive value and invalid dates or currencies', () => {
    const csv = [
      HEADER,
      'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10-01,',
      'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10-02,NaN',
      'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10-05,0',
      'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10,1.1',
      'EXR.D.XX.EUR.SP00.A,D,XX,EUR,SP00,A,2026-10-06,1.1',
    ].join('\n');
    expect(parseEcbCsv(csv)).toEqual([]);
  });

  it('an empty body or one without the expected columns yields no rows', () => {
    expect(parseEcbCsv('')).toEqual([]);
    expect(parseEcbCsv('<html>error</html>')).toEqual([]);
  });
});
