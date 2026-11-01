import { queryGeneric } from 'convex/server';
import { ConvexError } from 'convex/values';
import { reportDataArgs } from '../../server.js';

export const rows = queryGeneric({
  args: reportDataArgs,
  handler: async (_ctx, { source, params }) => {
    if (source === 'boom') throw new ConvexError('source unavailable');
    return [{ source, ...params }];
  },
});
