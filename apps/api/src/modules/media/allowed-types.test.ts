import { describe, expect, it } from 'vitest';

import { extensionFor, isAcceptedDetection, typeForExtension } from './allowed-types';

describe('allowed media types', () => {
  it('maps the four raster types to extensions and back', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(typeForExtension('JPG')).toBe('image/jpeg');
    expect(typeForExtension('avif')).toBe('image/avif');
    expect(typeForExtension('svg')).toBeUndefined();
  });

  it('accepts only detections of allowed types', () => {
    expect(isAcceptedDetection({ ext: 'png', mime: 'image/png' })).toBe(true);
    expect(isAcceptedDetection({ ext: 'pdf', mime: 'application/pdf' })).toBe(false);
    expect(isAcceptedDetection({ ext: 'xml', mime: 'application/xml' })).toBe(false);
    expect(isAcceptedDetection(undefined)).toBe(false);
  });
});
