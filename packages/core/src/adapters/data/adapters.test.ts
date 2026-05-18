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
