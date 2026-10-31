/**
 * Versioned report-template storage, independent of any host or database.
 *
 * A template has a stable `id` and a list of immutable versions numbered 1, 2, 3...;
 * `save` appends a new version and never rewrites an old one. Concurrent editors are
 * handled optimistically: pass the version you loaded as `expectedVersion` and `save`
 * fails with {@link TemplateVersionConflictError} if somebody saved in between.
 *
 * Every schema is validated against ReportSchemaV1 on save and again on load
 * ({@link InvalidTemplateSchemaError}), so a store never hands out a schema the engine
 * cannot render.
 *
 * Permissions are left to the host: a store does whatever its backend allows. Database
 * backed stores (for example `@reports-web/convex`) take an authorization hook on the server.
 */
import { validateReport, type ReportSchemaV1 } from '../../schema/report-schema.js';

/** Free-form data stored with a template head; all optional. */
export interface TemplateMeta {
  /** Display name. Defaults to the schema's `meta.name`. */
  readonly name?: string;
  readonly ownerId?: string;
  readonly orgId?: string;
  /** Who saved this version (recorded on the version, not the head). */
  readonly createdBy?: string;
}

export interface TemplateSummary {
  readonly id: string;
  readonly name: string;
  readonly currentVersion: number;
  /** ISO 8601 time of the latest save. */
  readonly updatedAt: string;
  readonly ownerId?: string;
  readonly orgId?: string;
}

export interface TemplateVersionInfo {
  readonly id: string;
  readonly version: number;
  /** ISO 8601. */
  readonly savedAt: string;
  readonly createdBy?: string;
}

export interface StoredTemplate extends TemplateVersionInfo {
  readonly name: string;
  readonly schema: ReportSchemaV1;
  /** Latest version of the template (>= `version`). */
  readonly currentVersion: number;
}

export interface SaveTemplateOptions {
  /**
   * The version the caller started from: the save fails with
   * {@link TemplateVersionConflictError} unless it is still the latest one. `0` means
   * "the template must not exist yet". Omit to append unconditionally (last writer wins).
   */
  readonly expectedVersion?: number;
  readonly meta?: TemplateMeta;
}

export interface SaveTemplateResult {
  readonly id: string;
  readonly version: number;
  /** ISO 8601. */
  readonly savedAt: string;
}

export interface ListTemplatesOptions {
  readonly ownerId?: string;
  readonly orgId?: string;
  readonly limit?: number;
}

export interface TemplateStore {
  readonly id: string;
  /** Template heads, most recently saved first. */
  list(opts?: ListTemplatesOptions): Promise<readonly TemplateSummary[]>;
  /** The given version, or the latest one when `version` is omitted; `null` if absent. */
  get(id: string, version?: number): Promise<StoredTemplate | null>;
  /** Appends a new version (`id: null` creates a template with a store-generated id). */
  save(id: string | null, schema: ReportSchemaV1, opts?: SaveTemplateOptions): Promise<SaveTemplateResult>;
  /** Every version of a template, oldest first; empty if the template does not exist. */
  listVersions(id: string): Promise<readonly TemplateVersionInfo[]>;
  /** Removes the template and all of its versions. Optional. */
  delete?(id: string): Promise<void>;
}

/** Base class of every error a {@link TemplateStore} throws on purpose. */
export class TemplateStoreError extends Error {
  readonly code: string;
  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TemplateStoreError';
    this.code = code;
  }
}

export class TemplateVersionConflictError extends TemplateStoreError {
  readonly templateId: string;
  readonly expectedVersion: number;
  readonly actualVersion: number;
  constructor(templateId: string, expectedVersion: number, actualVersion: number) {
    super('TEMPLATE_VERSION_CONFLICT', `Template "${templateId}" is at version ${actualVersion}, expected ${expectedVersion}`);
    this.name = 'TemplateVersionConflictError';
    this.templateId = templateId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class InvalidTemplateSchemaError extends TemplateStoreError {
  readonly phase: 'save' | 'load';
  readonly templateId?: string;
  readonly version?: number;
  readonly detail: string;
  constructor(phase: 'save' | 'load', detail: string, templateId?: string, version?: number) {
    const where = templateId ? ` "${templateId}"${version != null ? ` v${version}` : ''}` : '';
    super('TEMPLATE_INVALID_SCHEMA', `Invalid report schema on ${phase} of template${where}: ${detail}`);
    this.name = 'InvalidTemplateSchemaError';
    this.phase = phase;
    this.detail = detail;
    if (templateId !== undefined) this.templateId = templateId;
    if (version !== undefined) this.version = version;
  }
}

export class TemplateAccessDeniedError extends TemplateStoreError {
  readonly action: string;
  readonly templateId?: string;
  constructor(action: string, templateId?: string) {
    super('TEMPLATE_ACCESS_DENIED', `Access denied: ${action}${templateId ? ` on template "${templateId}"` : ''}`);
    this.name = 'TemplateAccessDeniedError';
    this.action = action;
    if (templateId !== undefined) this.templateId = templateId;
  }
}

/** Validates `input` as ReportSchemaV1 or throws {@link InvalidTemplateSchemaError}. */
export function assertTemplateSchema(input: unknown, phase: 'save' | 'load', templateId?: string, version?: number): ReportSchemaV1 {
  const r = validateReport(input);
  if (!r.ok) throw new InvalidTemplateSchemaError(phase, r.error, templateId, version);
  return r.value;
}

interface MemoryVersion {
  readonly version: number;
  readonly json: string;
  readonly savedAt: string;
  readonly createdBy?: string;
}
interface MemoryHead {
  name: string;
  currentVersion: number;
  updatedAt: string;
  ownerId?: string;
  orgId?: string;
  readonly versions: MemoryVersion[];
}

export interface InMemoryTemplateStoreOptions {
  readonly id?: string;
  /** Clock, for tests. */
  readonly now?: () => Date;
  /** Id generator for `save(null, ...)`. */
  readonly newId?: () => string;
}

/**
 * Process-local {@link TemplateStore}: tests, demos, or a cache in front of a real one.
 * Schemas are kept as JSON strings, so stored versions cannot be mutated through a
 * returned object.
 */
export class InMemoryTemplateStore implements TemplateStore {
  readonly id: string;
  private readonly heads = new Map<string, MemoryHead>();
  private readonly now: () => Date;
  private readonly newId: () => string;
  private seq = 0;

  constructor(opts: InMemoryTemplateStoreOptions = {}) {
    this.id = opts.id ?? 'memory';
    this.now = opts.now ?? (() => new Date());
    this.newId = opts.newId ?? (() => `tpl-${(++this.seq).toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  }

  async list(opts: ListTemplatesOptions = {}): Promise<readonly TemplateSummary[]> {
    const out: TemplateSummary[] = [];
    for (const [id, h] of this.heads) {
      if (opts.ownerId !== undefined && h.ownerId !== opts.ownerId) continue;
      if (opts.orgId !== undefined && h.orgId !== opts.orgId) continue;
      out.push({ id, name: h.name, currentVersion: h.currentVersion, updatedAt: h.updatedAt, ...(h.ownerId !== undefined ? { ownerId: h.ownerId } : {}), ...(h.orgId !== undefined ? { orgId: h.orgId } : {}) });
    }
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    return opts.limit !== undefined ? out.slice(0, opts.limit) : out;
  }

  async get(id: string, version?: number): Promise<StoredTemplate | null> {
    const h = this.heads.get(id);
    if (!h) return null;
    const v = h.versions[(version ?? h.currentVersion) - 1];
    if (!v) return null;
    const schema = assertTemplateSchema(parseJson(v.json, id, v.version), 'load', id, v.version);
    return { id, version: v.version, currentVersion: h.currentVersion, name: h.name, savedAt: v.savedAt, schema, ...(v.createdBy !== undefined ? { createdBy: v.createdBy } : {}) };
  }

  async save(id: string | null, schema: ReportSchemaV1, opts: SaveTemplateOptions = {}): Promise<SaveTemplateResult> {
    const valid = assertTemplateSchema(schema, 'save', id ?? undefined);
    const tid = id ?? this.newId();
    const h = this.heads.get(tid);
    const current = h?.currentVersion ?? 0;
    if (opts.expectedVersion !== undefined && opts.expectedVersion !== current) throw new TemplateVersionConflictError(tid, opts.expectedVersion, current);
    const savedAt = this.now().toISOString();
    const m = opts.meta ?? {};
    const v: MemoryVersion = { version: current + 1, json: JSON.stringify(valid), savedAt, ...(m.createdBy !== undefined ? { createdBy: m.createdBy } : {}) };
    if (h) {
      h.versions.push(v);
      h.currentVersion = v.version;
      h.updatedAt = savedAt;
      if (m.name !== undefined) h.name = m.name;
      if (m.ownerId !== undefined) h.ownerId = m.ownerId;
      if (m.orgId !== undefined) h.orgId = m.orgId;
    } else {
      this.heads.set(tid, {
        name: m.name ?? valid.meta.name,
        currentVersion: 1,
        updatedAt: savedAt,
        ...(m.ownerId !== undefined ? { ownerId: m.ownerId } : {}),
        ...(m.orgId !== undefined ? { orgId: m.orgId } : {}),
        versions: [v],
      });
    }
    return { id: tid, version: v.version, savedAt };
  }

  async listVersions(id: string): Promise<readonly TemplateVersionInfo[]> {
    return (this.heads.get(id)?.versions ?? []).map((v) => ({ id, version: v.version, savedAt: v.savedAt, ...(v.createdBy !== undefined ? { createdBy: v.createdBy } : {}) }));
  }

  async delete(id: string): Promise<void> {
    this.heads.delete(id);
  }

  /** Test hook: replace a stored version's raw JSON (to simulate a corrupt backend). */
  unsafeOverwriteRaw(id: string, version: number, json: string): void {
    const h = this.heads.get(id);
    const i = version - 1;
    if (!h || !h.versions[i]) throw new Error(`No version ${version} of "${id}"`);
    h.versions[i] = { ...h.versions[i]!, json };
  }
}

function parseJson(json: string, id: string, version: number): unknown {
  try {
    return JSON.parse(json);
  } catch (e) {
    throw new InvalidTemplateSchemaError('load', `not JSON (${(e as Error).message})`, id, version);
  }
}
