import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildDerivatives, inspectImage, readMetadata } from './derivatives';

const FIXTURES = resolve(import.meta.dirname, '../../../../../tests/fixtures/media');
const fixture = (name: string): Buffer => readFileSync(resolve(FIXTURES, name));

describe('derivatives', () => {
  it('produces four widths in webp and avif without enlarging small sources', async () => {
    const derivatives = await buildDerivatives(fixture('sample.png'));

    expect(derivatives.map((d) => `${d.width}.${d.format}`)).toEqual([
      '320.webp',
      '320.avif',
      '640.webp',
      '640.avif',
      '1024.webp',
      '1024.avif',
      '1600.webp',
      '1600.avif',
    ]);
    const largest = derivatives.find((d) => d.width === 1600 && d.format === 'webp');
    expect((await readMetadata(largest!.body)).width).toBe(1400);
    expect((await readMetadata(derivatives[0]!.body)).width).toBe(320);
  });

  it('rotates by EXIF and strips every metadata block', async () => {
    const source = fixture('exif.jpg');
    const sourceMeta = await readMetadata(source);
    const derivatives = await buildDerivatives(source);

    expect(sourceMeta.orientation).toBe(6);
    expect(sourceMeta.exif).toBeDefined();
    for (const derivative of derivatives) {
      const meta = await readMetadata(derivative.body);
      expect(meta.exif).toBeUndefined();
      expect(meta.icc).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
      expect(meta.height).toBeGreaterThan(meta.width ?? 0);
    }
  });

  it('refuses polyglots, SVG and PDFs at decode time', async () => {
    await expect(inspectImage(fixture('polyglot.png'))).rejects.toThrow();
    await expect(inspectImage(fixture('pdf-as.jpg'))).rejects.toThrow();
    await expect(inspectImage(Buffer.from('<html></html>'))).rejects.toThrow();
    const ok = await inspectImage(fixture('sample.avif'));
    expect(ok.width).toBe(1400);
  });
});
