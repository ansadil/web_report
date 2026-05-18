import { describe, it, expect } from 'vitest';
import { TEMPLATES, getTemplate } from './index.js';
import { validateReport } from '../schema/report-schema.js';

describe('built-in templates', () => {
  for (const tpl of TEMPLATES) {
    it(`template "${tpl.id}" produces a valid schema`, () => {
      const built = tpl.build();
      const v = validateReport(built);
      expect(v.ok).toBe(true);
    });
  }
  it('getTemplate returns by id', () => {
    expect(getTemplate('tabular')?.id).toBe('tabular');
    expect(getTemplate('xxx')).toBeUndefined();
  });
});
