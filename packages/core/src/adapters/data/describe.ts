import type { DataDictionaryDescription } from './types.js';

/** A `describe` option: either a ready description or an async function producing one. */
export type DescribeOption = DataDictionaryDescription | (() => Promise<DataDictionaryDescription>);

/** Normalizes a `describe` option into an adapter `describe()` method. */
export function toDescribeFn(d: DescribeOption): () => Promise<DataDictionaryDescription> {
  return typeof d === 'function' ? d : async () => d;
}
