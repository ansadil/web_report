import { describe, expect, it } from 'vitest';
import { ConvexHttpClient } from 'convex/browser';
import type { ConvexCallClient } from './index.js';

describe('ConvexCallClient', () => {
  it('is satisfied by the official Convex HTTP client (type-level)', () => {
    const c: ConvexCallClient = new ConvexHttpClient('https://example.convex.cloud');
    expect(typeof c.query).toBe('function');
  });
});
