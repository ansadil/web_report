import { defineTable } from 'convex/server';
import { v } from 'convex/values';

/** Table names used by the template functions. */
export const TEMPLATE_TABLE = 'reportTemplates' as const;
export const TEMPLATE_VERSION_TABLE = 'reportTemplateVersions' as const;

/**
 * Template head: one row per template, pointing at its latest version.
 * `templateId` is the public id (the head's own `_id` when the template was created without one).
 */
export const reportTemplatesTable = defineTable({
  templateId: v.string(),
  name: v.string(),
  currentVersion: v.number(),
  updatedAt: v.number(),
  ownerId: v.optional(v.string()),
  orgId: v.optional(v.string()),
})
  .index('by_template_id', ['templateId'])
  .index('by_updated', ['updatedAt'])
  .index('by_owner', ['ownerId', 'updatedAt'])
  .index('by_org', ['orgId', 'updatedAt']);

/**
 * Immutable template versions. The schema is stored as a JSON string (`schemaJson`) so report
 * schemas never hit Convex field-name rules (e.g. keys starting with `$` or `_`).
 */
export const reportTemplateVersionsTable = defineTable({
  templateId: v.string(),
  version: v.number(),
  schemaJson: v.string(),
  createdAt: v.number(),
  createdBy: v.optional(v.string()),
}).index('by_template_version', ['templateId', 'version']);

/**
 * Spread into your `defineSchema`:
 *
 *   export default defineSchema({ ...reportTemplateTables, ...yourTables });
 */
export const reportTemplateTables = {
  [TEMPLATE_TABLE]: reportTemplatesTable,
  [TEMPLATE_VERSION_TABLE]: reportTemplateVersionsTable,
};
