import type { FunctionReference } from 'convex/server';
import {
  assertTemplateSchema,
  InvalidTemplateSchemaError,
  TemplateAccessDeniedError,
  TemplateStoreError,
  TemplateVersionConflictError,
  type ListTemplatesOptions,
  type SaveTemplateOptions,
  type SaveTemplateResult,
  type StoredTemplate,
  type TemplateStore,
  type TemplateSummary,
  type TemplateVersionInfo,
} from '@reports-web/core/adapters/storage/template-store';
import type { ReportSchemaV1 } from '@reports-web/core/schema/report-schema';
import type { SaveResult, TemplateGetResult, TemplateHeadResult, TemplateVersionResult } from './handlers.js';

type AnyArgs = Record<string, unknown>;
/**
 * Anything with Convex's `query`/`mutation` call shape: `ConvexClient`, `ConvexHttpClient`,
 * `ConvexReactClient`, convex-vue / nuxt wrappers, or `convex-test`.
 */
export interface ConvexCallClient {
  query(ref: FunctionReference<'query'>, args: AnyArgs): Promise<unknown>;
  mutation(ref: FunctionReference<'mutation'>, args: AnyArgs): Promise<unknown>;
}

/** References to the functions built by `defineTemplateFunctions`, e.g. `api.reportTemplates`. */
export interface TemplateFunctionRefs {
  readonly list: FunctionReference<'query'>;
  readonly get: FunctionReference<'query'>;
  readonly listVersions: FunctionReference<'query'>;
  readonly save: FunctionReference<'mutation'>;
  readonly remove?: FunctionReference<'mutation'>;
}

export interface ConvexTemplateStoreOptions {
  readonly client: ConvexCallClient;
  readonly api: TemplateFunctionRefs;
  readonly id?: string;
}

interface ErrorData {
  code?: string;
  message?: string;
  templateId?: string;
  expectedVersion?: number;
  actualVersion?: number;
  action?: string;
  phase?: string;
}

/** Maps a `ConvexError` from the template functions to the core error classes; anything else is rethrown. */
export function toTemplateStoreError(e: unknown): unknown {
  const data = (e as { data?: unknown } | null)?.data;
  if (!data || typeof data !== 'object') return e;
  const d = data as ErrorData;
  switch (d.code) {
    case 'TEMPLATE_VERSION_CONFLICT':
      return new TemplateVersionConflictError(d.templateId ?? '', d.expectedVersion ?? -1, d.actualVersion ?? -1);
    case 'TEMPLATE_ACCESS_DENIED':
      return new TemplateAccessDeniedError(d.action ?? 'unknown', d.templateId);
    case 'TEMPLATE_INVALID_SCHEMA':
      return new InvalidTemplateSchemaError('save', d.message ?? 'invalid schema', d.templateId);
    default:
      return typeof d.code === 'string' && d.code.startsWith('TEMPLATE_') ? new TemplateStoreError(d.code, d.message ?? d.code, { cause: e }) : e;
  }
}

const iso = (ms: number) => new Date(ms).toISOString();

/** {@link TemplateStore} backed by the Convex functions from `@reports-web/convex/server`. */
export class ConvexTemplateStore implements TemplateStore {
  readonly id: string;
  private readonly client: ConvexCallClient;
  private readonly api: TemplateFunctionRefs;

  constructor(opts: ConvexTemplateStoreOptions) {
    this.id = opts.id ?? 'convex';
    this.client = opts.client;
    this.api = opts.api;
    if (opts.api.remove) this.delete = (id) => this.mutate<null>(this.api.remove!, { id }).then(() => undefined);
  }

  delete?: (id: string) => Promise<void>;

  private async call<T>(fn: () => Promise<unknown>): Promise<T> {
    try {
      return (await fn()) as T;
    } catch (e) {
      throw toTemplateStoreError(e);
    }
  }
  private queryFn<T>(ref: FunctionReference<'query'>, args: AnyArgs) {
    return this.call<T>(() => this.client.query(ref, args));
  }
  private mutate<T>(ref: FunctionReference<'mutation'>, args: AnyArgs) {
    return this.call<T>(() => this.client.mutation(ref, args));
  }

  async list(opts: ListTemplatesOptions = {}): Promise<readonly TemplateSummary[]> {
    const rows = await this.queryFn<TemplateHeadResult[]>(this.api.list, compact({ ownerId: opts.ownerId, orgId: opts.orgId, limit: opts.limit }));
    return rows.map(({ updatedAt, ...r }) => ({ ...r, updatedAt: iso(updatedAt) }));
  }

  async get(id: string, version?: number): Promise<StoredTemplate | null> {
    const r = await this.queryFn<TemplateGetResult | null>(this.api.get, compact({ id, version }));
    if (!r) return null;
    let raw: unknown;
    try {
      raw = JSON.parse(r.schemaJson);
    } catch (e) {
      throw new InvalidTemplateSchemaError('load', `not JSON (${(e as Error).message})`, id, r.version);
    }
    const schema = assertTemplateSchema(raw, 'load', id, r.version);
    const { createdAt, schemaJson: _json, ...rest } = r;
    return { ...rest, savedAt: iso(createdAt), schema };
  }

  async save(id: string | null, schema: ReportSchemaV1, opts: SaveTemplateOptions = {}): Promise<SaveTemplateResult> {
    const valid = assertTemplateSchema(schema, 'save', id ?? undefined);
    const r = await this.mutate<SaveResult>(this.api.save, compact({ id, schemaJson: JSON.stringify(valid), expectedVersion: opts.expectedVersion, meta: opts.meta ? compact({ ...opts.meta }) : undefined }));
    return { id: r.id, version: r.version, savedAt: iso(r.savedAt) };
  }

  async listVersions(id: string): Promise<readonly TemplateVersionInfo[]> {
    const rows = await this.queryFn<TemplateVersionResult[]>(this.api.listVersions, { id });
    return rows.map(({ createdAt, ...r }) => ({ ...r, savedAt: iso(createdAt) }));
  }
}

/** Convex rejects `undefined` values in arguments; drop them. */
function compact<T extends Record<string, unknown>>(o: T): AnyArgs {
  const out: AnyArgs = {};
  for (const [k, val] of Object.entries(o)) if (val !== undefined) out[k] = val;
  return out;
}
