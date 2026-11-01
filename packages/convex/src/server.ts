/**
 * Server side: Convex function factories for template storage. Import from your `convex/`
 * folder (this entry point never touches the browser parts of `@reports-web/core`):
 *
 *   // convex/reportTemplates.ts
 *   import { defineTemplateFunctions } from '@reports-web/convex/server';
 *   export const { list, get, save, listVersions, remove } = defineTemplateFunctions({ authorize });
 */
import { mutationGeneric, queryGeneric, type GenericMutationCtx, type GenericQueryCtx, type GenericDataModel } from 'convex/server';
import { v } from 'convex/values';
import { createTemplateHandlers, type TemplateFunctionsOptions } from './handlers.js';

export { reportTemplateTables, reportTemplatesTable, reportTemplateVersionsTable, TEMPLATE_TABLE, TEMPLATE_VERSION_TABLE } from './schema.js';
export { createTemplateHandlers } from './handlers.js';
export type {
  TemplateAction,
  TemplateErrorCode,
  AuthorizeTemplate,
  TemplateFunctionsOptions,
  TemplateDb,
  TemplateHeadResult,
  TemplateVersionResult,
  TemplateGetResult,
  SaveResult,
} from './handlers.js';

const metaValidator = v.object({
  name: v.optional(v.string()),
  ownerId: v.optional(v.string()),
  orgId: v.optional(v.string()),
  createdBy: v.optional(v.string()),
});

export const templateArgs = {
  list: { ownerId: v.optional(v.string()), orgId: v.optional(v.string()), limit: v.optional(v.number()) },
  get: { id: v.string(), version: v.optional(v.number()) },
  listVersions: { id: v.string() },
  save: { id: v.union(v.string(), v.null()), schemaJson: v.string(), expectedVersion: v.optional(v.number()), meta: v.optional(metaValidator) },
  remove: { id: v.string() },
};

/** A scalar report parameter value: string, number, boolean or null. */
export const reportParamScalar = v.union(v.string(), v.number(), v.boolean(), v.null());

/**
 * One report parameter value as `ConvexDataAdapter` sends it: a scalar, an array of scalars, or a dateRange
 * `{ from?, to? }` with at least one end (`YYYY-MM-DD` strings). Nested objects and other shapes are rejected.
 */
export const reportParamValue = v.union(
  reportParamScalar,
  v.array(reportParamScalar),
  // dateRange: at least one end (core drops an empty range, so `{}` is never sent)
  v.object({ from: v.string(), to: v.optional(v.string()) }),
  v.object({ to: v.string() }),
);

/**
 * Args validator for the host's report data query / HTTP action that `ConvexDataAdapter` calls. `params` are the
 * report parameter values resolved and validated by core (`resolveParameterValues` / `buildDataQuery`) merged over
 * `dataset.params`: dates as `YYYY-MM-DD`, dateRanges as `{ from?, to? }`, datetimes as ISO strings, select values as
 * the option value.
 *
 * This checks the SHAPE only: `params` must be an object (not a string, `null` or an array) whose values are
 * {@link reportParamValue}s. It does not know the report's parameter definitions (required fields, `min` / `max`,
 * select options); re-check anything security-relevant (e.g. which branches the caller may see) on the server.
 * Hosts whose static `dataset.params` contain nested objects can extend `reportParamValue` in their own validator.
 *
 *   export const rows = query({ args: reportDataArgs, handler: async (ctx, { source, params }) => ... });
 */
export const reportDataArgs = { source: v.string(), params: v.record(v.string(), reportParamValue) };

/**
 * Builds the public Convex functions `list`, `get`, `listVersions` (queries) and `save`, `remove`
 * (mutations). Export them from one module in `convex/` and hand their `api.<module>.*` references
 * to `ConvexTemplateStore`. Use `queryGeneric`-style internal wrappers yourself if you need
 * different visibility; `createTemplateHandlers` exposes the bare handlers.
 */
export function defineTemplateFunctions<DataModel extends GenericDataModel = GenericDataModel>(
  opts: TemplateFunctionsOptions<GenericQueryCtx<DataModel>> = {},
) {
  // A mutation ctx is a superset of a query ctx, so `authorize` sees one type for both.
  const h = createTemplateHandlers<GenericQueryCtx<DataModel>>(opts);
  return {
    list: queryGeneric({ args: templateArgs.list, handler: (ctx, args) => h.list(ctx as GenericQueryCtx<DataModel>, args) }),
    get: queryGeneric({ args: templateArgs.get, handler: (ctx, args) => h.get(ctx as GenericQueryCtx<DataModel>, args) }),
    listVersions: queryGeneric({ args: templateArgs.listVersions, handler: (ctx, args) => h.listVersions(ctx as GenericQueryCtx<DataModel>, args) }),
    save: mutationGeneric({ args: templateArgs.save, handler: (ctx, args) => h.save(ctx as GenericMutationCtx<DataModel>, args) }),
    remove: mutationGeneric({ args: templateArgs.remove, handler: (ctx, args) => h.remove(ctx as GenericMutationCtx<DataModel>, args) }),
  };
}
