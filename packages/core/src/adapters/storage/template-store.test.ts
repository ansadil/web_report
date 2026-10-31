import { describe, expect, it } from 'vitest';
import { InMemoryTemplateStore } from './template-store.js';
import { defineTemplateStoreContract } from './template-store-contract.js';

function tickingClock(): () => Date {
  let t = Date.UTC(2026, 9, 31, 10, 0, 0);
  return () => new Date((t += 1000));
}

defineTemplateStoreContract({ describe, it, expect }, 'InMemoryTemplateStore', () => {
  const store = new InMemoryTemplateStore({ now: tickingClock() });
  return { store, corrupt: (id, v, json) => store.unsafeOverwriteRaw(id, v, json) };
});

describe('InMemoryTemplateStore', () => {
  it('uses the injected id generator', async () => {
    const store = new InMemoryTemplateStore({ newId: () => 'fixed' });
    const { contractSchema } = await import('./template-store-contract.js');
    expect((await store.save(null, contractSchema('x'))).id).toBe('fixed');
  });
  it('filters list() by ownerId / orgId', async () => {
    const { contractSchema } = await import('./template-store-contract.js');
    const store = new InMemoryTemplateStore({ now: tickingClock() });
    await store.save('a', contractSchema('a'), { meta: { orgId: 'o1', ownerId: 'u1' } });
    await store.save('b', contractSchema('b'), { meta: { orgId: 'o2' } });
    expect((await store.list({ orgId: 'o1' })).map((s) => s.id)).toEqual(['a']);
    expect((await store.list({ ownerId: 'u1' })).map((s) => s.id)).toEqual(['a']);
  });
});
