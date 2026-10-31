import { defineTemplateFunctions } from '../../server.js';

/** Same tables, but the host's authorize hook refuses everything (half by returning false, half by throwing). */
export const { list, get, save, listVersions, remove } = defineTemplateFunctions({
  authorize: (_ctx, action) => {
    if (action === 'list' || action === 'read') return false;
    throw new Error('no session');
  },
});
