import { describe, expect, it } from 'vitest';

import { classifyQuery } from './search';

describe('classifyQuery', () => {
  it('recognises phones, order numbers and email prefixes', () => {
    expect(classifyQuery('9876543210')).toEqual({ kind: 'phone', value: '9876543210' });
    expect(classifyQuery(' pe-20260001 ')).toEqual({ kind: 'order', value: 'PE-20260001' });
    expect(classifyQuery('Irul@Exa')).toEqual({ kind: 'email', value: 'irul@exa' });
    expect(classifyQuery('1234567890')).toEqual({ kind: 'email', value: '1234567890' });
    expect(classifyQuery('   ')).toEqual({ kind: 'none', value: '' });
  });
});
