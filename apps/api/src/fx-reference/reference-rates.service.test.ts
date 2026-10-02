import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../db/database.module.js';
import { fxReferenceCoverage } from '../db/schema.js';
import { createTestDb, resetDb } from '../../test/db.js';
import type { EcbRate, ReferenceRatesProvider } from './ecb-reference-rates.provider.js';
import { ReferenceRatesService } from './reference-rates.service.js';

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

/** Fuente simulada: sirve una serie fija, apunta cada tramo pedido y puede fallar a voluntad. */
class StubProvider implements ReferenceRatesProvider {
  readonly name = 'stub';
  rates: EcbRate[] = [];
  calls: { currencies: string[]; from: string; to: string }[] = [];
  fail = false;

  getRates(currencies: readonly string[], from: string, to: string): Promise<EcbRate[]> {
    this.calls.push({ currencies: [...currencies], from, to });
    if (this.fail) return Promise.reject(new Error('ECB down'));
    return Promise.resolve(this.rates.filter((r) => currencies.includes(r.currency) && r.date >= from && r.date <= to));
  }
}

describe('ReferenceRatesService (integración con Postgres)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let provider: StubProvider;
  let service: ReferenceRatesService;

  beforeAll(() => {
    ({ db, close } = createTestDb());
  });
  afterAll(() => close());
  beforeEach(async () => {
    await resetDb(db);
    provider = new StubProvider();
    provider.rates = [
      { currency: 'USD', date: '2024-03-27', unitsPerEur: 1.0816 },
      { currency: 'USD', date: '2024-03-28', unitsPerEur: 1.0811 },
      { currency: 'USD', date: '2024-04-02', unitsPerEur: 1.0745 },
      { currency: 'CHF', date: '2024-04-02', unitsPerEur: 0.9767 },
      { currency: 'USD', date: daysAgo(1), unitsPerEur: 1.12 },
    ];
    service = new ReferenceRatesService(db, provider);
  });

  it('descarga el tramo una vez, lo guarda y luego lo sirve desde la BD', async () => {
    const first = await service.getRates(['USD'], '2024-03-28');
    // Incluye los días previos que puede necesitar una operación en festivo.
    expect(first.USD?.map((p) => p.date)).toEqual(['2024-03-27', '2024-03-28', '2024-04-02', daysAgo(1)]);
    expect(first.USD?.[0].unitsPerEur).toBeCloseTo(1.0816, 8);
    expect(provider.calls).toEqual([{ currencies: ['USD'], from: '2024-03-21', to: today }]);

    const second = await service.getRates(['USD'], '2024-03-28');
    expect(second).toEqual(first);
    expect(provider.calls).toHaveLength(1);
  });

  it('pide solo lo que falta por delante de lo ya cubierto', async () => {
    await service.getRates(['USD'], '2024-04-01');
    await service.getRates(['USD'], '2024-03-28');
    expect(provider.calls.slice(1)).toEqual([{ currencies: ['USD'], from: '2024-03-21', to: '2024-03-24' }]);
  });

  it('una divisa sin serie queda anotada y no se vuelve a pedir', async () => {
    const rates = await service.getRates(['XAU'], '2024-04-01');
    expect(rates).toEqual({ XAU: [] });
    await service.getRates(['XAU'], '2024-04-01');
    expect(provider.calls).toHaveLength(1);
  });

  it('si la fuente falla no anota cobertura y reintenta en la siguiente petición', async () => {
    provider.fail = true;
    expect(await service.getRates(['USD'], '2024-04-01')).toEqual({ USD: [] });
    expect(await db.select().from(fxReferenceCoverage).where(eq(fxReferenceCoverage.currency, 'USD'))).toEqual([]);

    provider.fail = false;
    expect((await service.getRates(['USD'], '2024-04-01')).USD).toHaveLength(4);
    expect(provider.calls).toHaveLength(2);
  });

  it('vuelve a mirar el final de la serie cuando la comprobación es antigua', async () => {
    await service.getRates(['USD'], '2024-04-01');
    await db
      .update(fxReferenceCoverage)
      .set({ toDate: daysAgo(3), checkedAt: new Date(Date.now() - 7 * 3_600_000) })
      .where(eq(fxReferenceCoverage.currency, 'USD'));

    await service.getRates(['USD'], '2024-04-01');
    expect(provider.calls.at(-1)).toEqual({ currencies: ['USD'], from: daysAgo(10), to: today });
  });

  it('ignora el euro y los códigos inválidos y separa las divisas', async () => {
    const rates = await service.getRates(['EUR', 'usd', 'CHF', 'USD'], '2024-04-02');
    expect(Object.keys(rates).sort()).toEqual(['CHF', 'USD']);
    expect(rates.CHF).toEqual([{ date: '2024-04-02', unitsPerEur: 0.9767 }]);
    expect(await service.getRates(['EUR'], '2024-04-02')).toEqual({});
  });
});
