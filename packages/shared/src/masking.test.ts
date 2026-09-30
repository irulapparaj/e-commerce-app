import { describe, expect, it } from 'vitest';

import { asPublicValue, maskAddressLine, maskEmail, maskName, maskPhone } from './masking';

describe('masking', () => {
  it('masks phones keeping two leading and three trailing digits', () => {
    expect(maskPhone('9876543210')).toBe('98•••••210');
    expect(maskPhone(' 9876543210 ')).toBe('98•••••210');
    expect(maskPhone('12345')).toBe('1••••');
    expect(maskPhone('1')).toBe('•');
    expect(maskPhone('')).toBe('');
  });

  it('masks the local part of emails and tolerates malformed input', () => {
    expect(maskEmail('irul@example.com')).toBe('i•••@example.com');
    expect(maskEmail('IRUL.R@Example.com')).toBe('I•••@Example.com');
    expect(maskEmail('nodomain')).toBe('n•••');
    expect(maskEmail('@x.com')).toBe('@•••');
    expect(maskEmail('')).toBe('');
  });

  it('keeps only the last word of an address line', () => {
    expect(maskAddressLine('12 Temple Street')).toBe('•••• Street');
    expect(maskAddressLine('  Anna Nagar  ')).toBe('•••• Nagar');
    expect(maskAddressLine('Flat')).toBe('•••• Flat');
    expect(maskAddressLine('')).toBe('');
  });

  it('reduces names to initial plus surname, including unicode', () => {
    expect(maskName('Irul Rajan')).toBe('I. Rajan');
    expect(maskName('Irul')).toBe('I.');
    expect(maskName('Aadhya Devi Sharma')).toBe('A. Sharma');
    expect(maskName('ஆதி ராஜன்')).toBe('ஆ. ராஜன்');
    expect(maskName('   ')).toBe('');
  });

  it('brands public values without changing them', () => {
    expect(asPublicValue('Chennai')).toBe('Chennai');
  });
});
