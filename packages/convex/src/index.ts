/**
 * Client side of `@reports-web/convex`. Server-side function factories live in
 * `@reports-web/convex/server`.
 */
export { ConvexTemplateStore, toTemplateStoreError } from './client.js';
export type { ConvexCallClient, TemplateFunctionRefs, ConvexTemplateStoreOptions } from './client.js';
export { createConvexDataAdapter, ConvexDataAdapter } from './data-adapter.js';
export type { ConvexDataAdapterOptions, ConvexQueryDataAdapterOptions, ConvexHttpDataAdapterOptions, ConvexDataRequest } from './data-adapter.js';
export type { TemplateAction, TemplateErrorCode } from './handlers.js';
