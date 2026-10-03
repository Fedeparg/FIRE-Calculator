import { describe, expect, it } from 'vitest';

import { parseEcbCsv } from './ecb-reference-rates.provider.js';

const HEADER = 'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE';

describe('parseEcbCsv', () => {
  it('lee divisa, fecha y valor por el nombre de la columna', () => {
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

  it('no depende del orden de las columnas', () => {
    const csv = ['TIME_PERIOD,OBS_VALUE,CURRENCY', '2026-10-01,1.1298,USD'].join('\n');
    expect(parseEcbCsv(csv)).toEqual([{ currency: 'USD', date: '2026-10-01', unitsPerEur: 1.1298 }]);
  });

  it('descarta filas con valor vacío, no numérico o no positivo y fechas o divisas inválidas', () => {
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

  it('un cuerpo vacío o sin las columnas esperadas no da filas', () => {
    expect(parseEcbCsv('')).toEqual([]);
    expect(parseEcbCsv('<html>error</html>')).toEqual([]);
  });
});
