import { queryGeneric } from 'convex/server';
import { ConvexError, v } from 'convex/values';

export const rows = queryGeneric({
  args: { source: v.string(), params: v.any() },
  handler: async (_ctx, { source, params }) => {
    if (source === 'boom') throw new ConvexError('source unavailable');
    return [{ source, ...params }];
  },
});
