import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createStaticAdapter } from './static.js';
import { createRestAdapter } from './rest.js';
import { createGraphQLAdapter } from './graphql.js';
import { createSqlProxyAdapter } from './sql-proxy.js';
import { createCustomAdapter } from './custom.js';
import { DataAdapterRegistry } from './registry.js';

describe('Static adapter', () => {
  it('returns rows by source name', async () => {
    const a = createStaticAdapter({ tables: { sales: [{ id: 1 }, { id: 2 }] } });
    const rows = await a.fetch({ source: 'sales' });
    expect(rows.length).toBe(2);
  });
  it('introspect infers types', async () => {
    const a = createStaticAdapter({ tables: { x: [{ n: 1, s: 'a', b: true, d: '2026-01-01' }] } });
    const fields = (await a.introspect!({ source: 'x' })).slice();
    expect(fields).toContainEqual({ name: 'n', type: 'number' });
    expect(fields).toContainEqual({ name: 's', type: 'string' });
    expect(fields).toContainEqual({ name: 'b', type: 'bool' });
    expect(fields).toContainEqual({ name: 'd', type: 'date' });
  });
  it('throws if source missing', async () => {
    const a = createStaticAdapter({ tables: {} });
    await expect(a.fetch({ source: 'x' })).rejects.toThrow(/not found/);
  });
});

describe('REST adapter', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
  it('issues GET and extracts data array', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ a: 1 }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof globalThis.fetch;
    const a = createRestAdapter({ baseUrl: 'http://api/' });
    const rows = await a.fetch({ source: 'list' });
    expect(rows.length).toBe(1);
  });
  it('uses POST when configured', async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify([{ a: 1 }]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    globalThis.fetch = spy as unknown as typeof globalThis.fetch;
    const a = createRestAdapter({ baseUrl: 'http://api/q', method: 'POST' });
    await a.fetch({ source: 'list', params: { id: 1 } });
    expect(spy).toHaveBeenCalled();
    const call = spy.mock.calls[0]?.[1] as RequestInit;
    expect(call.method).toBe('POST');
    expect(call.body).toContain('"list"');
  });
  it('throws on non-2xx', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof globalThis.fetch;
    const a = createRestAdapter({ baseUrl: 'http://api/' });
    await expect(a.fetch({ source: 'x' })).rejects.toThrow(/500/);
  });
});

describe('GraphQL adapter', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
  it('builds query and extracts rows', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ data: { sales: [{ a: 1 }, { a: 2 }] } }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof globalThis.fetch;
    const a = createGraphQLAdapter({
      endpoint: 'http://gql',
      buildQuery: (s) => ({ query: `{ ${s} { a } }` }),
    });
    const rows = await a.fetch({ source: 'sales' });
    expect(rows.length).toBe(2);
  });
  it('surfaces GraphQL errors', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: 'denied' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof globalThis.fetch;
    const a = createGraphQLAdapter({ endpoint: 'http://gql', buildQuery: () => ({ query: '{}' }) });
    await expect(a.fetch({ source: 'x' })).rejects.toThrow(/denied/);
  });
});

describe('SQL-Proxy adapter', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });
  it('posts query and bindings', async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({ rows: [{ x: 1 }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    globalThis.fetch = spy as unknown as typeof globalThis.fetch;
    const a = createSqlProxyAdapter({ endpoint: 'http://proxy/query' });
    const rows = await a.fetch({ source: 'SELECT * FROM t WHERE id = :id', params: { id: 5 } });
    expect(rows.length).toBe(1);
    const body = JSON.parse(spy.mock.calls[0]?.[1]?.body as string) as { query: string; bindings: Record<string, unknown> };
    expect(body.query).toContain('SELECT');
    expect(body.bindings.id).toBe(5);
  });
});

describe('Custom adapter', () => {
  it('wraps user function', async () => {
    const a = createCustomAdapter({ fetch: async () => [{ z: 1 }] });
    expect(a.id).toBe('custom');
    expect((await a.fetch({ source: 'x' })).length).toBe(1);
  });
});

describe('DataAdapterRegistry', () => {
  it('registers and retrieves adapters', () => {
    const r = new DataAdapterRegistry();
    r.register(createStaticAdapter({ tables: {} }));
    expect(r.has('static')).toBe(true);
    expect(r.get('static').id).toBe('static');
  });
  it('throws on duplicate register', () => {
    const r = new DataAdapterRegistry();
    const a = createStaticAdapter({ tables: {} });
    r.register(a);
    expect(() => r.register(a)).toThrow();
    r.replace(a);
  });
  it('throws on missing get with helpful message', () => {
    const r = new DataAdapterRegistry();
    expect(() => r.get('rest')).toThrow(/Available/);
  });
});

describe('Adapter describe() pass-through', () => {
  const desc = { sources: [{ name: 's', fields: [{ name: 'a', type: 'string' as const }] }] };
  it('static adapter exposes describe from an object', async () => {
    const a = createStaticAdapter({ tables: {}, describe: desc });
    expect(await a.describe!()).toEqual(desc);
  });
  it('static adapter has no describe by default', () => {
    expect(createStaticAdapter({ tables: {} }).describe).toBeUndefined();
  });
  it('REST adapter exposes describe from a function', async () => {
    const a = createRestAdapter({ baseUrl: 'http://api/', describe: async () => desc });
    expect(await a.describe!()).toEqual(desc);
    expect(createRestAdapter({ baseUrl: 'http://api/' }).describe).toBeUndefined();
  });
  it('custom adapter passes describe through', async () => {
    const describeFn = async () => desc;
    const a = createCustomAdapter({ fetch: async () => [], describe: describeFn });
    expect(a.describe).toBe(describeFn);
    expect(createCustomAdapter({ fetch: async () => [] }).describe).toBeUndefined();
  });
});

describe('Report parameters reach adapters via DataQuery.params', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const params = { year: 2026, active: true, period: { from: '2026-01-01', to: '2026-01-31' }, at: new Date(Date.UTC(2026, 0, 1)), none: null };

  it('REST GET serializes scalars, dates and dateRange objects (bracket notation) into the query string', async () => {
    const spy = vi.fn(async (_url: string) => json([]));
    globalThis.fetch = spy as unknown as typeof globalThis.fetch;
    await createRestAdapter({ baseUrl: 'http://api/' }).fetch({ source: 'sales', params });
    const url = new URL(spy.mock.calls[0]![0]);
    expect(url.searchParams.get('year')).toBe('2026');
    expect(url.searchParams.get('active')).toBe('true');
    expect(url.searchParams.get('period[from]')).toBe('2026-01-01');
    expect(url.searchParams.get('period[to]')).toBe('2026-01-31');
    expect(url.searchParams.get('at')).toBe('2026-01-01T00:00:00.000Z');
    expect(url.searchParams.has('none')).toBe(false);
  });

  it('REST POST sends params in the JSON body', async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => json([]));
    globalThis.fetch = spy as unknown as typeof globalThis.fetch;
    await createRestAdapter({ baseUrl: 'http://api/q', method: 'POST' }).fetch({ source: 'sales', params });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string) as { source: string; params: Record<string, unknown> };
    expect(body.source).toBe('sales');
    expect(body.params).toEqual({ year: 2026, active: true, period: { from: '2026-01-01', to: '2026-01-31' }, at: '2026-01-01T00:00:00.000Z', none: null });
  });

  it('GraphQL hands params to buildQuery so they can become variables', async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => json({ data: { sales: [] } }));
    globalThis.fetch = spy as unknown as typeof globalThis.fetch;
    const buildQuery = vi.fn((s: string, p: Readonly<Record<string, unknown>>) => ({ query: `query($year:Int){ ${s}(year:$year){a} }`, variables: { year: p.year, period: p.period } }));
    await createGraphQLAdapter({ endpoint: 'http://gql', buildQuery }).fetch({ source: 'sales', params });
    expect(buildQuery).toHaveBeenCalledWith('sales', params);
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string) as { variables: Record<string, unknown> };
    expect(body.variables).toEqual({ year: 2026, period: { from: '2026-01-01', to: '2026-01-31' } });
  });

  it('SQL-proxy sends params as bindings', async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => json({ rows: [] }));
    globalThis.fetch = spy as unknown as typeof globalThis.fetch;
    await createSqlProxyAdapter({ endpoint: 'http://proxy' }).fetch({ source: 'SELECT 1', params: { year: 2026, period: params.period } });
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string) as { bindings: Record<string, unknown> };
    expect(body.bindings).toEqual({ year: 2026, period: { from: '2026-01-01', to: '2026-01-31' } });
  });

  it('custom adapter receives the full DataQuery', async () => {
    const fetchFn = vi.fn(async (_q: unknown, _s?: AbortSignal) => []);
    const ctl = new AbortController();
    await createCustomAdapter({ fetch: fetchFn }).fetch({ source: 's', params }, ctl.signal);
    expect(fetchFn).toHaveBeenCalledWith({ source: 's', params }, ctl.signal);
  });
});
