/**
 * Conformance suite for {@link TemplateStore} implementations. Test-runner agnostic: pass
 * your runner's `describe`, `it` and `expect` (vitest, jest):
 *
 *   import { describe, it, expect } from 'vitest';
 *   import { defineTemplateStoreContract } from '@reports-web/core/adapters/storage/template-store-contract';
 *   defineTemplateStoreContract({ describe, it, expect }, 'MyStore', async () => ({ store: new MyStore(), corrupt }));
 *
 * Not part of the main entry point (no runtime cost for hosts).
 */
import { validateReport, type ReportSchemaV1 } from '../../schema/report-schema.js';
import { InvalidTemplateSchemaError, TemplateAccessDeniedError, TemplateVersionConflictError, type TemplateStore } from './template-store.js';

interface ExpectLike {
  toBe(v: unknown): void;
  toEqual(v: unknown): void;
  toBeNull(): void;
  toMatchObject(v: object): void;
  toBeInstanceOf(c: abstract new (...args: never[]) => unknown): void;
  rejects: { toBeInstanceOf(c: abstract new (...args: never[]) => unknown): Promise<void>; toMatchObject(v: object): Promise<void> };
}
export interface ContractRunner {
  describe(name: string, fn: () => void): void;
  it(name: string, fn: () => Promise<void> | void): void;
  expect(actual: unknown): ExpectLike;
}

export interface TemplateStoreFixture {
  /** A fresh, empty store whose clock advances between saves. */
  readonly store: TemplateStore;
  /** Replace the stored raw JSON of one version (simulates a corrupt or foreign row). */
  corrupt(id: string, version: number, json: string): Promise<void> | void;
  /** Optional: the same backend seen by a caller the host's authorization denies. */
  readonly denied?: TemplateStore;
}

/** A minimal valid report schema named `name` (defaults filled in by the validator). */
export function contractSchema(name: string): ReportSchemaV1 {
  const r = validateReport({
    version: '1',
    id: `contract-${name}`,
    meta: { name, locale: 'en', dir: 'ltr' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 10, right: 10, bottom: 10, left: 10 } },
    dataset: { adapter: 'static', source: 'rows' },
    fields: [],
    bands: { detail: { height: 8, elements: [] } },
  });
  if (!r.ok) throw new Error(`contract fixture is invalid: ${r.error}`);
  return r.value;
}

export function defineTemplateStoreContract(t: ContractRunner, name: string, setup: () => Promise<TemplateStoreFixture> | TemplateStoreFixture): void {
  const { describe, it, expect } = t;
  describe(`TemplateStore contract: ${name}`, () => {
    it('save(null) creates version 1 with a generated id; get() returns it', async () => {
      const { store } = await setup();
      const r = await store.save(null, contractSchema('A'));
      expect(typeof r.id === 'string' && r.id.length > 0).toBe(true);
      expect(r.version).toBe(1);
      expect(Number.isNaN(Date.parse(r.savedAt))).toBe(false);
      const got = await store.get(r.id);
      expect(got).toMatchObject({ id: r.id, version: 1, currentVersion: 1, name: 'A', savedAt: r.savedAt });
      expect(got!.schema).toEqual(contractSchema('A'));
    });

    it('versions increase by one; get() is the latest, get(id, v) a specific one', async () => {
      const { store } = await setup();
      const { id } = await store.save(null, contractSchema('v1'));
      const r2 = await store.save(id, contractSchema('v2'), { expectedVersion: 1 });
      const r3 = await store.save(id, contractSchema('v3'));
      expect([r2.version, r3.version]).toEqual([2, 3]);
      expect((await store.get(id))!.schema.meta.name).toBe('v3');
      expect((await store.get(id, 1))!.schema.meta.name).toBe('v1');
      expect(await store.get(id, 2)).toMatchObject({ version: 2, currentVersion: 3 });
      expect(await store.get(id, 4)).toBeNull();
      expect(await store.get('does-not-exist')).toBeNull();
    });

    it('listVersions() is oldest first; empty for an unknown id', async () => {
      const { store } = await setup();
      const { id } = await store.save(null, contractSchema('a'), { meta: { createdBy: 'u1' } });
      await store.save(id, contractSchema('b'), { meta: { createdBy: 'u2' } });
      const vs = await store.listVersions(id);
      expect(vs.map((v) => [v.id, v.version, v.createdBy])).toEqual([[id, 1, 'u1'], [id, 2, 'u2']]);
      expect(Date.parse(vs[0]!.savedAt) <= Date.parse(vs[1]!.savedAt)).toBe(true);
      expect(await store.listVersions('does-not-exist')).toEqual([]);
    });

    it('a stale expectedVersion fails with TemplateVersionConflictError and writes nothing', async () => {
      const { store } = await setup();
      const { id } = await store.save(null, contractSchema('a'));
      await store.save(id, contractSchema('b'), { expectedVersion: 1 });
      await expect(store.save(id, contractSchema('stale'), { expectedVersion: 1 })).rejects.toBeInstanceOf(TemplateVersionConflictError);
      await expect(store.save(id, contractSchema('stale'), { expectedVersion: 1 })).rejects.toMatchObject({ code: 'TEMPLATE_VERSION_CONFLICT', templateId: id, expectedVersion: 1, actualVersion: 2 });
      await expect(store.save(id, contractSchema('new'), { expectedVersion: 0 })).rejects.toBeInstanceOf(TemplateVersionConflictError);
      expect((await store.listVersions(id)).length).toBe(2);
      expect((await store.get(id))!.schema.meta.name).toBe('b');
    });

    it('expectedVersion 0 creates a template under a caller-chosen id', async () => {
      const { store } = await setup();
      const r = await store.save('my-invoice', contractSchema('Invoice'), { expectedVersion: 0 });
      expect([r.id, r.version]).toEqual(['my-invoice', 1]);
      await expect(store.save('other', contractSchema('x'), { expectedVersion: 1 })).rejects.toMatchObject({ actualVersion: 0 });
    });

    it('an invalid schema is rejected on save (InvalidTemplateSchemaError, phase "save") and not stored', async () => {
      const { store } = await setup();
      const bad = { ...contractSchema('bad'), version: '2' } as unknown as ReportSchemaV1;
      await expect(store.save(null, bad)).rejects.toBeInstanceOf(InvalidTemplateSchemaError);
      await expect(store.save('bad-id', bad)).rejects.toMatchObject({ code: 'TEMPLATE_INVALID_SCHEMA', phase: 'save' });
      expect(await store.get('bad-id')).toBeNull();
      expect(await store.list()).toEqual([]);
    });

    it('an invalid stored schema is rejected on load (InvalidTemplateSchemaError, phase "load")', async () => {
      const fx = await setup();
      const { id } = await fx.store.save(null, contractSchema('ok'));
      await fx.store.save(id, contractSchema('ok2'));
      await fx.corrupt(id, 1, JSON.stringify({ version: '1', meta: 'nope' }));
      await expect(fx.store.get(id, 1)).rejects.toMatchObject({ code: 'TEMPLATE_INVALID_SCHEMA', phase: 'load', templateId: id, version: 1 });
      await fx.corrupt(id, 2, '{not json');
      await expect(fx.store.get(id)).rejects.toBeInstanceOf(InvalidTemplateSchemaError);
    });

    it('stored versions are immutable (returned and saved objects are copies)', async () => {
      const { store } = await setup();
      const input = contractSchema('orig');
      const { id } = await store.save(null, input);
      (input.meta as { name: string }).name = 'mutated-input';
      const got = await store.get(id);
      (got!.schema.meta as { name: string }).name = 'mutated-output';
      await store.save(id, contractSchema('second'));
      expect((await store.get(id, 1))!.schema.meta.name).toBe('orig');
    });

    it('list() returns heads, most recently saved first, with name and currentVersion', async () => {
      const { store } = await setup();
      const a = await store.save(null, contractSchema('A'));
      const b = await store.save(null, contractSchema('B'), { meta: { name: 'Bee' } });
      await store.save(a.id, contractSchema('A2'));
      const l = await store.list();
      expect(l.map((s) => [s.id, s.name, s.currentVersion])).toEqual([[a.id, 'A', 2], [b.id, 'Bee', 1]]);
      expect((await store.list({ limit: 1 })).length).toBe(1);
    });

    it('delete() (when supported) removes the template and its versions', async () => {
      const { store } = await setup();
      if (!store.delete) return;
      const { id } = await store.save(null, contractSchema('gone'));
      await store.delete(id);
      expect(await store.get(id)).toBeNull();
      expect(await store.listVersions(id)).toEqual([]);
    });

    it('a denied caller gets TemplateAccessDeniedError (when the backend authorizes)', async () => {
      const fx = await setup();
      if (!fx.denied) return;
      const { id } = await fx.store.save(null, contractSchema('secret'));
      await expect(fx.denied.get(id)).rejects.toBeInstanceOf(TemplateAccessDeniedError);
      await expect(fx.denied.save(id, contractSchema('x'))).rejects.toBeInstanceOf(TemplateAccessDeniedError);
      await expect(fx.denied.list()).rejects.toBeInstanceOf(TemplateAccessDeniedError);
      await expect(fx.denied.listVersions(id)).rejects.toBeInstanceOf(TemplateAccessDeniedError);
      expect((await fx.store.get(id))!.version).toBe(1);
    });
  });
}
