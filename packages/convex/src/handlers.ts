/**
 * Database logic of the template functions, written against the small slice of Convex's
 * `ctx.db` it needs so it can be read (and tested) without a deployment.
 */
import { ConvexError } from 'convex/values';
import { validateReport } from '@reports-web/core/schema/report-schema';
import { TEMPLATE_TABLE, TEMPLATE_VERSION_TABLE } from './schema.js';

export type TemplateAction = 'list' | 'read' | 'listVersions' | 'create' | 'save' | 'delete';

/** Error codes carried in `ConvexError.data.code`; `ConvexTemplateStore` maps them to the core error classes. */
export type TemplateErrorCode = 'TEMPLATE_VERSION_CONFLICT' | 'TEMPLATE_ACCESS_DENIED' | 'TEMPLATE_INVALID_SCHEMA';

/**
 * Host-provided permission check. Return `true` to allow; `false` (or throwing) denies with
 * `TEMPLATE_ACCESS_DENIED`. A thrown `ConvexError` is passed through unchanged.
 * `templateId` is absent for `list` and for `create` without a caller-chosen id.
 */
export type AuthorizeTemplate<Ctx> = (ctx: Ctx, action: TemplateAction, templateId?: string) => boolean | Promise<boolean>;

export interface TemplateFunctionsOptions<Ctx = unknown> {
  /** Called before every function. Default: allow everything (permissions are the host's job). */
  readonly authorize?: AuthorizeTemplate<Ctx>;
  /** Validate schemas with ReportSchemaV1 in `save` (default `true`). Clients validate again on load. */
  readonly validate?: boolean;
  /** Clock (ms since epoch). Default `Date.now`. */
  readonly now?: () => number;
}

interface Doc {
  readonly _id: string;
  readonly [field: string]: unknown;
}
interface IndexRange {
  eq(field: string, value: unknown): IndexRange;
}
interface Query {
  order(order: 'asc' | 'desc'): Query;
  first(): Promise<Doc | null>;
  unique(): Promise<Doc | null>;
  collect(): Promise<Doc[]>;
  take(n: number): Promise<Doc[]>;
}
interface QueryInitializer extends Query {
  withIndex(name: string, range?: (q: IndexRange) => IndexRange): Query;
}
/** The subset of Convex's `DatabaseReader`/`DatabaseWriter` used here. */
export interface TemplateDb {
  query(table: string): QueryInitializer;
  insert(table: string, doc: Record<string, unknown>): Promise<string>;
  patch(id: string, fields: Record<string, unknown>): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ListArgs {
  readonly ownerId?: string;
  readonly orgId?: string;
  readonly limit?: number;
}
export interface SaveArgs {
  readonly id: string | null;
  readonly schemaJson: string;
  readonly expectedVersion?: number;
  readonly meta?: { readonly name?: string; readonly ownerId?: string; readonly orgId?: string; readonly createdBy?: string };
}

export interface TemplateHeadResult {
  id: string;
  name: string;
  currentVersion: number;
  updatedAt: number;
  ownerId?: string;
  orgId?: string;
}
export interface TemplateVersionResult {
  id: string;
  version: number;
  createdAt: number;
  createdBy?: string;
}
export interface TemplateGetResult extends TemplateVersionResult {
  name: string;
  currentVersion: number;
  schemaJson: string;
}
export interface SaveResult {
  id: string;
  version: number;
  savedAt: number;
}

function fail(code: TemplateErrorCode, message: string, extra: Record<string, string | number> = {}): never {
  throw new ConvexError({ code, message, ...extra });
}

function head(d: Doc): TemplateHeadResult {
  return {
    id: d.templateId as string,
    name: d.name as string,
    currentVersion: d.currentVersion as number,
    updatedAt: d.updatedAt as number,
    ...(d.ownerId !== undefined ? { ownerId: d.ownerId as string } : {}),
    ...(d.orgId !== undefined ? { orgId: d.orgId as string } : {}),
  };
}
function versionInfo(d: Doc): TemplateVersionResult {
  return {
    id: d.templateId as string,
    version: d.version as number,
    createdAt: d.createdAt as number,
    ...(d.createdBy !== undefined ? { createdBy: d.createdBy as string } : {}),
  };
}

function findHead(db: TemplateDb, id: string): Promise<Doc | null> {
  return db.query(TEMPLATE_TABLE).withIndex('by_template_id', (q) => q.eq('templateId', id)).unique();
}
function findVersion(db: TemplateDb, id: string, version: number): Promise<Doc | null> {
  return db.query(TEMPLATE_VERSION_TABLE).withIndex('by_template_version', (q) => q.eq('templateId', id).eq('version', version)).unique();
}

/** Pure handlers behind the Convex functions; `ctx` is passed to `authorize` untouched. */
export function createTemplateHandlers<Ctx extends { db: unknown }>(opts: TemplateFunctionsOptions<Ctx> = {}) {
  const validate = opts.validate ?? true;
  const now = opts.now ?? Date.now;
  const db = (ctx: Ctx) => ctx.db as TemplateDb;

  async function authorize(ctx: Ctx, action: TemplateAction, templateId?: string): Promise<void> {
    if (!opts.authorize) return;
    let ok: boolean;
    try {
      ok = await opts.authorize(ctx, action, templateId);
    } catch (e) {
      if (e instanceof ConvexError) throw e;
      ok = false;
    }
    if (ok !== true) fail('TEMPLATE_ACCESS_DENIED', `Access denied: ${action}${templateId ? ` on template "${templateId}"` : ''}`, { action, ...(templateId ? { templateId } : {}) });
  }

  return {
    async list(ctx: Ctx, args: ListArgs): Promise<TemplateHeadResult[]> {
      await authorize(ctx, 'list');
      const q = db(ctx).query(TEMPLATE_TABLE);
      let rows: Doc[];
      if (args.orgId !== undefined) rows = await q.withIndex('by_org', (r) => r.eq('orgId', args.orgId)).order('desc').collect();
      else if (args.ownerId !== undefined) rows = await q.withIndex('by_owner', (r) => r.eq('ownerId', args.ownerId)).order('desc').collect();
      else {
        const ordered = q.withIndex('by_updated').order('desc');
        rows = args.limit !== undefined ? await ordered.take(args.limit) : await ordered.collect();
      }
      if (args.ownerId !== undefined) rows = rows.filter((r) => r.ownerId === args.ownerId);
      const out = rows.map(head);
      return args.limit !== undefined ? out.slice(0, args.limit) : out;
    },

    async get(ctx: Ctx, args: { id: string; version?: number }): Promise<TemplateGetResult | null> {
      await authorize(ctx, 'read', args.id);
      const h = await findHead(db(ctx), args.id);
      if (!h) return null;
      const v = await findVersion(db(ctx), args.id, args.version ?? (h.currentVersion as number));
      if (!v) return null;
      return { ...versionInfo(v), name: h.name as string, currentVersion: h.currentVersion as number, schemaJson: v.schemaJson as string };
    },

    async listVersions(ctx: Ctx, args: { id: string }): Promise<TemplateVersionResult[]> {
      await authorize(ctx, 'listVersions', args.id);
      const rows = await db(ctx).query(TEMPLATE_VERSION_TABLE).withIndex('by_template_version', (q) => q.eq('templateId', args.id)).order('asc').collect();
      return rows.map(versionInfo);
    },

    /** Runs inside one Convex mutation, i.e. one serializable transaction: read head, check, insert, patch. */
    async save(ctx: Ctx, args: SaveArgs): Promise<SaveResult> {
      const d = db(ctx);
      const existing = args.id !== null ? await findHead(d, args.id) : null;
      await authorize(ctx, existing ? 'save' : 'create', args.id ?? undefined);

      let parsed: unknown;
      try {
        parsed = JSON.parse(args.schemaJson);
      } catch (e) {
        fail('TEMPLATE_INVALID_SCHEMA', `not JSON (${(e as Error).message})`, { phase: 'save' });
      }
      let name: string | undefined;
      if (validate) {
        const r = validateReport(parsed);
        if (!r.ok) fail('TEMPLATE_INVALID_SCHEMA', r.error, { phase: 'save', ...(args.id ? { templateId: args.id } : {}) });
        name = r.value.meta.name;
      } else {
        name = (parsed as { meta?: { name?: unknown } })?.meta?.name as string | undefined;
      }

      const current = (existing?.currentVersion as number | undefined) ?? 0;
      if (args.expectedVersion !== undefined && args.expectedVersion !== current) {
        fail('TEMPLATE_VERSION_CONFLICT', `Template "${args.id}" is at version ${current}, expected ${args.expectedVersion}`, {
          templateId: args.id ?? '',
          expectedVersion: args.expectedVersion,
          actualVersion: current,
        });
      }

      const t = now();
      const m = args.meta ?? {};
      let id: string;
      let headId: string;
      if (existing) {
        id = args.id as string;
        headId = existing._id;
      } else {
        headId = await d.insert(TEMPLATE_TABLE, {
          templateId: args.id ?? '',
          name: m.name ?? name ?? 'Untitled',
          currentVersion: 0,
          updatedAt: t,
          ...(m.ownerId !== undefined ? { ownerId: m.ownerId } : {}),
          ...(m.orgId !== undefined ? { orgId: m.orgId } : {}),
        });
        id = args.id ?? headId;
      }
      const version = current + 1;
      await d.insert(TEMPLATE_VERSION_TABLE, {
        templateId: id,
        version,
        schemaJson: args.schemaJson,
        createdAt: t,
        ...(m.createdBy !== undefined ? { createdBy: m.createdBy } : {}),
      });
      await d.patch(headId, {
        templateId: id,
        currentVersion: version,
        updatedAt: t,
        ...(existing && m.name !== undefined ? { name: m.name } : {}),
        ...(existing && m.ownerId !== undefined ? { ownerId: m.ownerId } : {}),
        ...(existing && m.orgId !== undefined ? { orgId: m.orgId } : {}),
      });
      return { id, version, savedAt: t };
    },

    async remove(ctx: Ctx, args: { id: string }): Promise<null> {
      await authorize(ctx, 'delete', args.id);
      const d = db(ctx);
      const h = await findHead(d, args.id);
      const versions = await d.query(TEMPLATE_VERSION_TABLE).withIndex('by_template_version', (q) => q.eq('templateId', args.id)).collect();
      for (const v of versions) await d.delete(v._id);
      if (h) await d.delete(h._id);
      return null;
    },
  };
}
