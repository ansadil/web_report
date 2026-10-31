import { defineTemplateFunctions } from '../../server.js';
import { tick } from './clock.js';

/** Authorize hook that sees the real ctx: only signed-in users, and only "editor"s may write. */
export const { list, get, save, listVersions, remove } = defineTemplateFunctions({
  now: tick,
  authorize: async (ctx, action) => {
    const who = await ctx.auth.getUserIdentity();
    if (!who) return false;
    if (action === 'list' || action === 'read' || action === 'listVersions') return true;
    return who.subject === 'editor';
  },
});
