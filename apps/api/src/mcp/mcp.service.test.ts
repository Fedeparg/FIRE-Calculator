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
 * The real MCP server, connected to a real MCP client over an in-memory transport. The data
 * services are test doubles: this tests the tool wiring (registration, schemas, auditing and the
 * computation over the user's data), not the DB, which has its own tests.
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
  // The real report over the same doubles: `get_realised_gains` is built by `TaxReturnService`.
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
  if (first?.type !== 'text') throw new Error('Expected a text result');
  return JSON.parse(first.text);
}

let client: Client | undefined;
afterEach(async () => {
  await client?.close();
  client = undefined;
});

describe('McpService', () => {
  it('advertises the portfolio and analysis tools and the two generic calculator tools', async () => {
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
    // The calculators are read-only and do not touch the outside world.
    for (const name of ['list_calculators', 'calculate']) {
      expect(tools.find((t) => t.name === name)?.annotations).toMatchObject({
        readOnlyHint: true,
        openWorldHint: false,
      });
    }
    expect(tools.find((t) => t.name === 'calculate')?.inputSchema.required).toEqual(['calculator', 'inputs']);
  });

  it('lists every calculator with its input schema', async () => {
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

  it('runs a calculator and audits the call with its slug', async () => {
    const { service, audit } = makeService();
    client = await connect(service);

    const result = parse(
      await client.callTool({
        name: 'calculate',
        arguments: { calculator: 'hipoteca-fija', inputs: { principal: 100_000, annualRate: 0, years: 10 } },
      }),
    );

    // 0% rate: €100,000 in 120 equal instalments.
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

  it('an unknown slug is a tool error and is audited without the client slug', async () => {
    const { service, audit } = makeService();
    client = await connect(service);
    const result = (await client.callTool({
      name: 'calculate',
      arguments: { calculator: 'no-existe', inputs: {} },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Unknown calculator: ');
    expect(JSON.stringify(result.content)).toContain('list_calculators');
    expect(audit.record).toHaveBeenCalledWith(USER, 'client-1', 'calculate', 'error');
  });

  it('rejects an out-of-range, wrongly typed or unknown input as a tool error, without computing', async () => {
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
    expect(JSON.stringify(tooMany.content)).toContain('Invalid input for simulador-montecarlo: paths');

    expect((await call('simulador-montecarlo', { ...montecarlo, extra: 1 })).isError).toBe(true);
    expect((await call('hipoteca-fija', { principal: 'mucho', annualRate: 3, years: 10 })).isError).toBe(true);
    expect((await call('hipoteca-fija', { principal: 1000 })).isError).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(USER, 'client-1', 'calculate:simulador-montecarlo', 'error');
    expect(audit.record).not.toHaveBeenCalledWith(USER, 'client-1', expect.any(String), 'ok');
  });

  it("computes the capital gains per tax year with FIFO from the user's lots", async () => {
    client = await connect(makeService().service);

    const all = parse(await client.callTool({ name: 'get_realised_gains', arguments: {} })) as {
      years: { year: number; net: number; fxDifference: number; unconverted: unknown[] }[];
    };
    expect(all.years.map((y) => y.year)).toEqual([2025]);
    const [year] = all.years;
    // EUR: 5 × 120 − 1 commission − 5 × 100 = 99. USD: 2 × 140 − 2 × 150 = −20 USD at the sale-date rate.
    expect(year?.net).toBeCloseTo(99 - 20 / 1.04, 6);
    // The 300 USD invested are worth fewer euros at the sale than at the purchase.
    expect(year?.fxDifference).toBeCloseTo(300 / 1.04 - 300 / 1.03, 6);
    expect(year?.unconverted).toEqual([]);

    const none = parse(await client.callTool({ name: 'get_realised_gains', arguments: { year: 2024 } }));
    expect(none).toEqual({ years: [], ratesLoaded: true });
  });

  it('get_realised_gains returns the same figures as the tax return report (a single computation)', async () => {
    const { service, taxReturn } = makeService();
    client = await connect(service);

    const tool = parse(await client.callTool({ name: 'get_realised_gains', arguments: { year: 2025 } }));
    const report = await taxReturn.build(USER, 2025);

    expect(tool).toEqual({ years: [report.gains], ratesLoaded: true });
  });

  it('get_realised_gains degrades if the ECB is down: foreign-currency sales unconverted and ratesLoaded false', async () => {
    const { service, referenceRates, audit } = makeService();
    referenceRates.getRates.mockRejectedValueOnce(new Error('ECB request failed: timeout'));
    client = await connect(service);

    const result = parse(await client.callTool({ name: 'get_realised_gains', arguments: {} })) as {
      ratesLoaded: boolean;
      years: { year: number; net: number; unconverted: unknown[] }[];
    };

    expect(result.ratesLoaded).toBe(false);
    const [year] = result.years;
    // The euro sale is still computed; the USD one is left out of the totals.
    expect(year?.net).toBeCloseTo(99, 6);
    // USD: 2 × 140 − 2 × 150 = −20 USD.
    expect(year?.unconverted).toEqual([{ currency: 'USD', sales: 1, gain: -20 }]);
    expect(audit.record).toHaveBeenCalledWith(USER, 'client-1', 'get_realised_gains', 'ok');
  });

  it('serves the tax return report for the requested year or, without one, the latest year with data', async () => {
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

  it('measures the FIRE goal against the real market value of the portfolio', async () => {
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

  it('also measures an amount goal within a time frame', async () => {
    const { service } = makeService();
    client = await connect(service);

    const result = parse(
      await client.callTool({
        name: 'get_fire_goal_progress',
        arguments: { targetAmount: 1_200_000, targetYears: 10, contribution: 0, annualReturn: 0, display: 'USD' },
      }),
    );
    // A 600,000 portfolio with no contributions or returns: it falls short and needs 5,000 a month.
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

  it('rejects mixing both modes or leaving one half-filled', async () => {
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

  it('delegates the breakdown and the scenarios to their services, with the token user', async () => {
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

  it('does not forward the text of an internal error to the host: only a reference', async () => {
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
    expect(text).toMatch(/Internal error while running the operation \(ref\. [0-9a-f-]{36}\)/);
    expect(audit.record).toHaveBeenCalledWith(USER, 'client-1', 'get_portfolio_breakdown', 'error');
  });

  it('does forward the message (and code) of Nest domain errors', async () => {
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

  it('validates writes with the full REST schema, refinements included (REST/MCP parity)', async () => {
    const { service, income } = makeService();
    client = await connect(service, [SCOPE_PORTFOLIO_READ, SCOPE_PORTFOLIO_WRITE]);
    const call = async (name: string, args: Record<string, unknown>) =>
      (await defined(client).callTool({ name, arguments: args })) as CallToolResult;

    // The "at least one field" rule of PATCH /api/income/:id: REST rejects it and so does MCP.
    expect(updateIncomeSchema.safeParse({}).success).toBe(false);
    const empty = await call('update_income', { id: 'i1' });
    expect(empty.isError).toBe(true);
    expect(JSON.stringify(empty.content)).toContain('no hay ningún campo que actualizar');

    // The "withholdings do not exceed the gross amount" rule of POST /api/income.
    const tooMuch = { kind: 'dividend', paidAt: '2025-05-01', gross: 1, withholdingSpain: 2 };
    expect(createIncomeSchema.safeParse(tooMuch).success).toBe(false);
    const rejected = await call('add_income', tooMuch);
    expect(rejected.isError).toBe(true);
    expect(JSON.stringify(rejected.content)).toContain(
      'Invalid input: gross: las retenciones no pueden superar el íntegro',
    );

    expect(income.update).not.toHaveBeenCalled();
    expect(income.create).not.toHaveBeenCalled();

    // Valid input does reach the service, already normalised by the schema.
    expect((await call('update_income', { id: 'i1', gross: 10 })).isError).toBeFalsy();
    expect(income.update).toHaveBeenCalledWith(USER, 'i1', { gross: 10 });
  });

  it('forwards domain errors with their code, just like REST', async () => {
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

  it('requires portfolio:read for the read tools and audits the rejection', async () => {
    const { service, audit } = makeService();
    client = await connect(service, []);

    const result = (await client.callTool({ name: 'list_positions', arguments: {} })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('This action requires read permission (portfolio:read)');
    expect(audit.record).toHaveBeenCalledWith(USER, 'client-1', 'list_positions', 'denied_scope');
  });
});
