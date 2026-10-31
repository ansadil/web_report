import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import { anyApi } from 'convex/server';
import { defineTemplateStoreContract, contractSchema } from '@reports-web/core/adapters/storage/template-store-contract';
import { TemplateAccessDeniedError, TemplateVersionConflictError, InvalidTemplateSchemaError } from '@reports-web/core/adapters/storage/template-store';
import schema from './test/convex/schema.js';
import { ConvexTemplateStore, toTemplateStoreError, type TemplateFunctionRefs } from './index.js';
import { TEMPLATE_VERSION_TABLE } from './server.js';

const modules = import.meta.glob('./test/convex/**/*.ts');
const api = anyApi as unknown as Record<'templates' | 'denied' | 'scoped', TemplateFunctionRefs>;

function setup() {
  const t = convexTest(schema, modules);
  const store = new ConvexTemplateStore({ client: t, api: api.templates });
  const denied = new ConvexTemplateStore({ client: t, api: api.denied });
  async function corrupt(id: string, version: number, json: string) {
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query(TEMPLATE_VERSION_TABLE)
        .withIndex('by_template_version', (q) => q.eq('templateId', id).eq('version', version))
        .unique();
      await ctx.db.patch(row!._id, { schemaJson: json });
    });
  }
  return { t, store, denied, corrupt };
}

defineTemplateStoreContract({ describe, it, expect }, 'ConvexTemplateStore (convex-test)', () => setup());

describe('Convex template functions', () => {
  it('save(null) uses the head document id as template id and stores one head + one row per version', async () => {
    const { t, store } = setup();
    const { id } = await store.save(null, contractSchema('A'), { meta: { orgId: 'org1', ownerId: 'u1', createdBy: 'u1' } });
    await store.save(id, contractSchema('A2'), { expectedVersion: 1 });
    const { heads, versions } = await t.run(async (ctx) => ({
      heads: await ctx.db.query('reportTemplates').collect(),
      versions: await ctx.db.query('reportTemplateVersions').collect(),
    }));
    expect(heads).toHaveLength(1);
    expect(heads[0]).toMatchObject({ _id: id, templateId: id, name: 'A', currentVersion: 2, orgId: 'org1', ownerId: 'u1' });
    expect(versions.map((v) => [v.templateId, v.version, JSON.parse(v.schemaJson).meta.name, v.createdBy])).toEqual([
      [id, 1, 'A', 'u1'],
      [id, 2, 'A2', undefined],
    ]);
  });

  it('filters list() by orgId / ownerId through the indexes', async () => {
    const { store } = setup();
    await store.save('a', contractSchema('a'), { meta: { orgId: 'o1', ownerId: 'u1' } });
    await store.save('b', contractSchema('b'), { meta: { orgId: 'o1', ownerId: 'u2' } });
    await store.save('c', contractSchema('c'), { meta: { orgId: 'o2', ownerId: 'u1' } });
    expect((await store.list({ orgId: 'o1' })).map((s) => s.id)).toEqual(['b', 'a']);
    expect((await store.list({ ownerId: 'u1' })).map((s) => s.id)).toEqual(['c', 'a']);
    expect((await store.list({ orgId: 'o1', ownerId: 'u1' })).map((s) => s.id)).toEqual(['a']);
  });

  it('the server validates on save even when the client is bypassed', async () => {
    const { t } = setup();
    const bad = { ...contractSchema('x'), page: 'nope' };
    const err = await t.mutation(api.templates.save, { id: null, schemaJson: JSON.stringify(bad) }).catch((e: unknown) => e);
    expect(toTemplateStoreError(err)).toBeInstanceOf(InvalidTemplateSchemaError);
    const notJson = await t.mutation(api.templates.save, { id: 'x', schemaJson: '{' }).catch((e: unknown) => e);
    expect(toTemplateStoreError(notJson)).toMatchObject({ code: 'TEMPLATE_INVALID_SCHEMA' });
    expect(await t.query(api.templates.list, {})).toEqual([]);
  });

  it('the server rejects a stale expectedVersion even when called directly', async () => {
    const { t, store } = setup();
    const { id } = await store.save(null, contractSchema('a'));
    await store.save(id, contractSchema('b'));
    const err = await t.mutation(api.templates.save, { id, schemaJson: JSON.stringify(contractSchema('c')), expectedVersion: 1 }).catch((e: unknown) => e);
    expect(toTemplateStoreError(err)).toMatchObject({ name: 'TemplateVersionConflictError', expectedVersion: 1, actualVersion: 2, templateId: id });
    expect(toTemplateStoreError(err)).toBeInstanceOf(TemplateVersionConflictError);
  });

  it('authorize() gets the real ctx (auth) and the action', async () => {
    const { t, store } = setup();
    const { id } = await store.save(null, contractSchema('a'));
    const anon = new ConvexTemplateStore({ client: t, api: api.scoped });
    const viewer = new ConvexTemplateStore({ client: t.withIdentity({ subject: 'viewer' }), api: api.scoped });
    const editor = new ConvexTemplateStore({ client: t.withIdentity({ subject: 'editor' }), api: api.scoped });
    await expect(anon.get(id)).rejects.toBeInstanceOf(TemplateAccessDeniedError);
    expect((await viewer.get(id))!.version).toBe(1);
    await expect(viewer.save(id, contractSchema('b'))).rejects.toMatchObject({ code: 'TEMPLATE_ACCESS_DENIED', action: 'save', templateId: id });
    await expect(viewer.save(null, contractSchema('n'))).rejects.toMatchObject({ action: 'create' });
    await expect(viewer.delete!(id)).rejects.toMatchObject({ action: 'delete' });
    expect((await editor.save(id, contractSchema('b'), { expectedVersion: 1 })).version).toBe(2);
  });

  it('leaves unrelated errors untouched', () => {
    const e = new Error('network');
    expect(toTemplateStoreError(e)).toBe(e);
  });
});
