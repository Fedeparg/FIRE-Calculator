import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { defined } from '@sextante/core/assert';
import { CALCULATORS } from '@sextante/core/calculators/schemas';

import { SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE } from '../oauth/oauth.constants.js';
import { createIncomeSchema } from '../income/dto/create-income.dto.js';
import { updateIncomeSchema } from '../income/dto/update-income.dto.js';
import { LotAggregateError } from '../positions/lot-aggregate.js';
import { TaxReturnService } from '../tax-return/tax-return.service.js';
import { McpService } from './mcp.service.js';

/**
 * El servidor MCP de verdad, conectado a un cliente MCP de verdad por un transporte en memoria.
 * Los servicios de datos son dobles: aquí se prueba el cableado de las tools (registro,
 * esquemas, auditoría y el cálculo sobre los datos del usuario), no la BD, que ya tiene sus
 * propios tests.
 */

const USER = 'user-1';

const positions = [
  { id: 'p1', ticker: 'IWDA.AS', name: 'iShares World', currency: 'EUR', quantity: 5, avgPrice: 100, broker: 'TR' },
  { id: 'p2', ticker: 'AAPL', name: 'Apple', currency: 'USD', quantity: 0, avgPrice: 0, broker: null },
];

const lots = [
  {
    id: 'l1',
    positionId: 'p1',
    kind: 'buy',
    quantity: 10,
    price: 100,
    fees: 0,
    tradedAt: '2024-03-01',
    note: null,
    createdAt: '2024-03-01T10:00:00.000Z',
  },
  {
    id: 'l2',
    positionId: 'p1',
    kind: 'sell',
    quantity: 5,
    price: 120,
    fees: 1,
    tradedAt: '2025-06-01',
    note: null,
    createdAt: '2025-06-01T10:00:00.000Z',
  },
  {
    id: 'l3',
    positionId: 'p2',
    kind: 'buy',
    quantity: 2,
    price: 150,
    fees: 0,
    tradedAt: '2025-01-10',
    note: null,
    createdAt: '2025-01-10T10:00:00.000Z',
  },
  {
    id: 'l4',
    positionId: 'p2',
    kind: 'sell',
    quantity: 2,
    price: 140,
    fees: 0,
    tradedAt: '2025-02-10',
    note: null,
    createdAt: '2025-02-10T10:00:00.000Z',
  },
];

function makeService() {
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const valuation = {
    valuate: vi.fn().mockResolvedValue({
      display: 'EUR',
      aggregate: { invested: 500, marketValue: 600_000, pnlAbs: 0, pnlPct: 0, valued: 1, total: 2 },
      fxAsOf: '2026-10-01',
      positions: [],
    }),
    breakdown: vi
      .fn()
      .mockResolvedValue({ slices: [], total: 0, included: 0, excluded: 0, display: 'EUR', fxAsOf: null }),
  };
  const scenarios = {
    findAllByUser: vi.fn().mockResolvedValue([
      {
        id: 's1',
        slug: 'independencia-financiera',
        name: 'Plan',
        inputs: { annualExpenses: 24_000 },
        createdAt: '',
        updatedAt: '',
      },
    ]),
  };
  const referenceRates = {
    getRates: vi.fn().mockResolvedValue({
      USD: [
        { date: '2025-01-10', unitsPerEur: 1.03 },
        { date: '2025-02-10', unitsPerEur: 1.04 },
      ],
    }),
  };
  const income = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 'i1' }),
    update: vi.fn().mockResolvedValue({ id: 'i1' }),
  };
  const positionsService = { findAllByUser: vi.fn().mockResolvedValue(positions) };
  const lotsService = { findAllByUser: vi.fn().mockResolvedValue(lots) };
  // El informe de verdad sobre los mismos dobles: `get_realised_gains` lo compone `TaxReturnService`.
  const taxReturn = new TaxReturnService(
    positionsService as never,
    lotsService as never,
    income as never,
    { list: vi.fn().mockResolvedValue([]) } as never,
    referenceRates as never,
  );
  const service = new McpService(
    positionsService as never,
    lotsService as never,
    valuation as never,
    {} as never,
    scenarios as never,
    {} as never,
    income as never,
    taxReturn,
    audit as never,
  );
  return { service, audit, valuation, scenarios, taxReturn, income, referenceRates };
}

async function connect(service: McpService, scopes: string[] = [SCOPE_PORTFOLIO_READ]): Promise<Client> {
  const server = service.createServer({ userId: USER, clientId: 'client-1', scopes });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function parse(result: unknown): unknown {
  const { content, isError } = result as CallToolResult;
  expect(isError).toBeFalsy();
  const [first] = content;
  if (first?.type !== 'text') throw new Error('Se esperaba un resultado de texto');
  return JSON.parse(first.text);
}

let client: Client | undefined;
afterEach(async () => {
  await client?.close();
  client = undefined;
});

describe('McpService', () => {
  it('anuncia las tools de cartera, de análisis y las dos genéricas de calculadoras', async () => {
    client = await connect(makeService().service);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'list_positions',
        'list_income',
        'add_income',
        'update_income',
        'delete_income',
        'get_realised_gains',
        'get_tax_return_report',
        'get_portfolio_breakdown',
        'get_fire_goal_progress',
        'list_saved_scenarios',
        'list_calculators',
        'calculate',
      ]),
    );
    expect(names.filter((n) => n.startsWith('calculate_'))).toEqual([]);
    expect(new Set(names).size).toBe(names.length);
    // Las calculadoras son de solo lectura y no tocan el mundo exterior.
    for (const name of ['list_calculators', 'calculate']) {
      expect(tools.find((t) => t.name === name)?.annotations).toMatchObject({
        readOnlyHint: true,
        openWorldHint: false,
      });
    }
    expect(tools.find((t) => t.name === 'calculate')?.inputSchema.required).toEqual(['calculator', 'inputs']);
  });

  it('lista todas las calculadoras con su esquema de entrada', async () => {
    const { service, audit } = makeService();
    client = await connect(service);

    const all = parse(await client.callTool({ name: 'list_calculators', arguments: {} })) as {
      slug: string;
      inputSchema: { properties: object };
    }[];
    expect(all.map((c) => c.slug).sort()).toEqual(Object.keys(CALCULATORS).sort());
    expect(all.every((c) => Object.keys(c.inputSchema.properties).length > 0)).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(USER, 'client-1', 'list_calculators', 'ok');

    const mortgage = parse(
      await client.callTool({ name: 'list_calculators', arguments: { slug: 'hipoteca-fija' } }),
    ) as { slug: string }[];
    expect(mortgage.map((c) => c.slug)).toEqual(['hipoteca-fija']);

    const tax = parse(await client.callTool({ name: 'list_calculators', arguments: { category: 'fiscalidad' } }));
    expect((tax as unknown[]).length).toBeGreaterThan(1);
  });

  it('ejecuta una calculadora y deja la llamada auditada con su slug', async () => {
    const { service, audit } = makeService();
    client = await connect(service);

    const result = parse(
      await client.callTool({
        name: 'calculate',
        arguments: { calculator: 'hipoteca-fija', inputs: { principal: 100_000, annualRate: 0, years: 10 } },
      }),
    );

    // Tipo 0: 100.000 € en 120 cuotas iguales.
    expect((result as { monthlyPayment: number }).monthlyPayment).toBeCloseTo(833.33, 2);
    expect(audit.record).toHaveBeenCalledWith(USER, 'client-1', 'calculate:hipoteca-fija', 'ok');

    const roi = parse(
      await client.callTool({
        name: 'calculate',
        arguments: { calculator: 'roi', inputs: { initial: 1000, final: 1500 } },
      }),
    );
    expect(roi).toMatchObject({ gain: 500 });
    expect(audit.record).toHaveBeenCalledWith(USER, 'client-1', 'calculate:roi', 'ok');
  });

  it('un slug desconocido es error de tool y se audita sin el slug del cliente', async () => {
    const { service, audit } = makeService();
    client = await connect(service);
    const result = (await client.callTool({
      name: 'calculate',
      arguments: { calculator: 'no-existe', inputs: {} },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('list_calculators');
    expect(audit.record).toHaveBeenCalledWith(USER, 'client-1', 'calculate', 'error');
  });

  it('rechaza una entrada fuera de rango, de otro tipo o desconocida como error de tool, sin calcular', async () => {
    const { service, audit } = makeService();
    client = await connect(service);
    const call = async (calculator: string, inputs: Record<string, unknown>) =>
      (await defined(client).callTool({ name: 'calculate', arguments: { calculator, inputs } })) as CallToolResult;

    const montecarlo = {
      annualExpenses: 1,
      currentSavings: 1,
      monthlySavings: 1,
      annualReturn: 5,
      volatility: 15,
      withdrawalRate: 4,
      retirementYears: 30,
    };
    const tooMany = await call('simulador-montecarlo', { ...montecarlo, paths: 10_000_000 });
    expect(tooMany.isError).toBe(true);
    expect(JSON.stringify(tooMany.content)).toContain('paths');

    expect((await call('simulador-montecarlo', { ...montecarlo, extra: 1 })).isError).toBe(true);
    expect((await call('hipoteca-fija', { principal: 'mucho', annualRate: 3, years: 10 })).isError).toBe(true);
    expect((await call('hipoteca-fija', { principal: 1000 })).isError).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(USER, 'client-1', 'calculate:simulador-montecarlo', 'error');
    expect(audit.record).not.toHaveBeenCalledWith(USER, 'client-1', expect.any(String), 'ok');
  });

  it('calcula las plusvalías por ejercicio con FIFO a partir de los lotes del usuario', async () => {
    client = await connect(makeService().service);

    const all = parse(await client.callTool({ name: 'get_realised_gains', arguments: {} })) as {
      years: { year: number; net: number; fxDifference: number; unconverted: unknown[] }[];
    };
    expect(all.years.map((y) => y.year)).toEqual([2025]);
    const [year] = all.years;
    // EUR: 5 × 120 − 1 de comisión − 5 × 100 = 99. USD: 2 × 140 − 2 × 150 = −20 USD al tipo de la venta.
    expect(year?.net).toBeCloseTo(99 - 20 / 1.04, 6);
    // Los 300 USD invertidos valen menos euros al vender que al comprar.
    expect(year?.fxDifference).toBeCloseTo(300 / 1.04 - 300 / 1.03, 6);
    expect(year?.unconverted).toEqual([]);

    const none = parse(await client.callTool({ name: 'get_realised_gains', arguments: { year: 2024 } }));
    expect(none).toEqual({ years: [], ratesLoaded: true });
  });

  it('get_realised_gains da las mismas cifras que el informe de la Renta (un único cálculo)', async () => {
    const { service, taxReturn } = makeService();
    client = await connect(service);

    const tool = parse(await client.callTool({ name: 'get_realised_gains', arguments: { year: 2025 } }));
    const report = await taxReturn.build(USER, 2025);

    expect(tool).toEqual({ years: [report.gains], ratesLoaded: true });
  });

  it('get_realised_gains degrada si cae el BCE: ventas en divisa sin convertir y ratesLoaded false', async () => {
    const { service, referenceRates, audit } = makeService();
    referenceRates.getRates.mockRejectedValueOnce(new Error('ECB request failed: timeout'));
    client = await connect(service);

    const result = parse(await client.callTool({ name: 'get_realised_gains', arguments: {} })) as {
      ratesLoaded: boolean;
      years: { year: number; net: number; unconverted: unknown[] }[];
    };

    expect(result.ratesLoaded).toBe(false);
    const [year] = result.years;
    // La venta en euros sigue calculada; la de USD queda fuera de los totales.
    expect(year?.net).toBeCloseTo(99, 6);
    // USD: 2 × 140 − 2 × 150 = −20 USD.
    expect(year?.unconverted).toEqual([{ currency: 'USD', sales: 1, gain: -20 }]);
    expect(audit.record).toHaveBeenCalledWith(USER, 'client-1', 'get_realised_gains', 'ok');
  });

  it('sirve el informe de la Renta del ejercicio pedido o, sin él, el del último con datos', async () => {
    const { service, taxReturn, audit } = makeService();
    const build = vi.spyOn(taxReturn, 'build').mockResolvedValue({
      year: 2025,
      availableYears: [2025],
      savings: null,
    } as Partial<Awaited<ReturnType<TaxReturnService['build']>>> as Awaited<ReturnType<TaxReturnService['build']>>);
    client = await connect(service);
    const { tools } = await client.listTools();
    expect(tools.find((t) => t.name === 'get_tax_return_report')?.annotations).toMatchObject({ readOnlyHint: true });

    expect(parse(await client.callTool({ name: 'get_tax_return_report', arguments: { year: 2025 } }))).toEqual({
      year: 2025,
      availableYears: [2025],
      savings: null,
    });
    expect(build).toHaveBeenLastCalledWith(USER, 2025);
    parse(await client.callTool({ name: 'get_tax_return_report', arguments: {} }));
    expect(build).toHaveBeenLastCalledWith(USER, undefined);
    expect(audit.record).toHaveBeenCalledWith(USER, 'client-1', 'get_tax_return_report', 'ok');

    const invalid = await client.callTool({ name: 'get_tax_return_report', arguments: { year: 1800 } });
    expect(invalid.isError).toBe(true);
  });

  it('mide el objetivo FIRE con el valor de mercado real de la cartera', async () => {
    const { service, valuation } = makeService();
    client = await connect(service);

    const result = parse(
      await client.callTool({
        name: 'get_fire_goal_progress',
        arguments: { annualExpenses: 24_000, withdrawalRate: 4, contribution: 1000, annualReturn: 5, display: 'USD' },
      }),
    );

    expect(valuation.valuate).toHaveBeenCalledWith(USER, 'USD');
    expect(result).toMatchObject({
      display: 'USD',
      target: 600_000,
      current: 600_000,
      reached: true,
      valuedPositions: 1,
      totalPositions: 2,
    });
    expect(result).not.toHaveProperty('simulation');

    const simulated = parse(
      await client.callTool({
        name: 'get_fire_goal_progress',
        arguments: {
          annualExpenses: 24_000,
          withdrawalRate: 4,
          contribution: 1000,
          annualReturn: 5,
          volatility: 15,
          retirementYears: 30,
        },
      }),
    );
    expect(simulated).toHaveProperty('simulation.successRate');
  });

  it('mide también un objetivo de cantidad en un plazo', async () => {
    const { service } = makeService();
    client = await connect(service);

    const result = parse(
      await client.callTool({
        name: 'get_fire_goal_progress',
        arguments: { targetAmount: 1_200_000, targetYears: 10, contribution: 0, annualReturn: 0, display: 'USD' },
      }),
    );
    // 600.000 de cartera sin aportar ni rentabilidad: no llega, y necesita 5.000 al mes.
    expect(result).toMatchObject({
      mode: 'amount',
      target: 1_200_000,
      current: 600_000,
      progress: 50,
      deadlineYears: 10,
      onTrack: false,
    });
    expect((result as { requiredContribution: number }).requiredContribution).toBeCloseTo(5000, 6);
  });

  it('rechaza mezclar los dos modos o dejar uno a medias', async () => {
    const { service } = makeService();
    client = await connect(service);

    for (const args of [
      { targetAmount: 1000, contribution: 0, annualReturn: 5 },
      { annualExpenses: 24_000, contribution: 0, annualReturn: 5 },
      {
        annualExpenses: 24_000,
        withdrawalRate: 4,
        targetAmount: 1000,
        targetYears: 5,
        contribution: 0,
        annualReturn: 5,
      },
    ]) {
      const result = (await client.callTool({ name: 'get_fire_goal_progress', arguments: args })) as CallToolResult;
      expect(result.isError).toBe(true);
    }
  });

  it('delega el reparto y los escenarios en sus servicios, con el usuario del token', async () => {
    const { service, valuation, scenarios } = makeService();
    client = await connect(service);

    await client.callTool({ name: 'get_portfolio_breakdown', arguments: { groupBy: 'broker' } });
    expect(valuation.breakdown).toHaveBeenCalledWith(USER, 'EUR', 'broker');

    const listed = parse(
      await client.callTool({ name: 'list_saved_scenarios', arguments: { slug: 'independencia-financiera' } }),
    );
    expect(scenarios.findAllByUser).toHaveBeenCalledWith(USER, 'independencia-financiera');
    expect(listed).toMatchObject({ scenarios: [{ id: 's1' }] });
  });

  it('no reenvía al host el texto de un error interno: solo una referencia', async () => {
    const { service, valuation, audit } = makeService();
    valuation.breakdown.mockRejectedValueOnce(
      new Error('Failed query: select "email" from "users" where "id" = $1\nparams: secreto@example.com'),
    );
    client = await connect(service);

    const result = (await client.callTool({
      name: 'get_portfolio_breakdown',
      arguments: { groupBy: 'broker' },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    const text = JSON.stringify(result.content);
    expect(text).not.toContain('Failed query');
    expect(text).not.toContain('secreto@example.com');
    expect(text).toMatch(/Error interno al ejecutar la operación \(ref\. [0-9a-f-]{36}\)/);
    expect(audit.record).toHaveBeenCalledWith(USER, 'client-1', 'get_portfolio_breakdown', 'error');
  });

  it('sí reenvía el mensaje (y el código) de los errores de dominio de Nest', async () => {
    const { service, valuation } = makeService();
    valuation.breakdown.mockRejectedValueOnce(
      new NotFoundException({ message: 'Posición no encontrada', code: 'POSITION_NOT_FOUND' }),
    );
    client = await connect(service);

    const result = (await client.callTool({
      name: 'get_portfolio_breakdown',
      arguments: { groupBy: 'broker' },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Posición no encontrada (POSITION_NOT_FOUND)');
  });

  it('valida las escrituras con el esquema REST completo, refinamientos incluidos (paridad REST/MCP)', async () => {
    const { service, income } = makeService();
    client = await connect(service, [SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE]);
    const call = async (name: string, args: Record<string, unknown>) =>
      (await defined(client).callTool({ name, arguments: args })) as CallToolResult;

    // "Al menos un campo" de PATCH /api/income/:id: REST lo rechaza y MCP también.
    expect(updateIncomeSchema.safeParse({}).success).toBe(false);
    const empty = await call('update_income', { id: 'i1' });
    expect(empty.isError).toBe(true);
    expect(JSON.stringify(empty.content)).toContain('no hay ningún campo que actualizar');

    // "Las retenciones no superan el íntegro" de POST /api/income.
    const tooMuch = { kind: 'dividend', paidAt: '2025-05-01', gross: 1, withholdingSpain: 2 };
    expect(createIncomeSchema.safeParse(tooMuch).success).toBe(false);
    const rejected = await call('add_income', tooMuch);
    expect(rejected.isError).toBe(true);
    expect(JSON.stringify(rejected.content)).toContain('las retenciones no pueden superar el íntegro');

    expect(income.update).not.toHaveBeenCalled();
    expect(income.create).not.toHaveBeenCalled();

    // Lo válido sí llega al servicio, ya normalizado por el esquema.
    expect((await call('update_income', { id: 'i1', gross: 10 })).isError).toBeFalsy();
    expect(income.update).toHaveBeenCalledWith(USER, 'i1', { gross: 10 });
  });

  it('reenvía los errores de dominio con su código, igual que REST', async () => {
    const { service, valuation } = makeService();
    valuation.breakdown.mockRejectedValueOnce(
      new LotAggregateError('NEGATIVE_QUANTITY', 'La cantidad de la posición quedaría en negativo'),
    );
    client = await connect(service);

    const result = (await client.callTool({
      name: 'get_portfolio_breakdown',
      arguments: { groupBy: 'broker' },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain(
      'La cantidad de la posición quedaría en negativo (NEGATIVE_QUANTITY)',
    );
  });

  it('exige portfolio:read para las tools de lectura y audita el rechazo', async () => {
    const { service, audit } = makeService();
    client = await connect(service, []);

    const result = (await client.callTool({ name: 'list_positions', arguments: {} })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('portfolio:read');
    expect(audit.record).toHaveBeenCalledWith(USER, 'client-1', 'list_positions', 'denied_scope');
  });
});
