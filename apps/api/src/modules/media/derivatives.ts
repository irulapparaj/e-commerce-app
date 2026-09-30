import sharp, { type Metadata, type Sharp } from 'sharp';

import {
  DERIVATIVE_FORMATS,
  DERIVATIVE_WIDTHS,
  type DerivativeFormat,
  type DerivativeWidth,
} from './url';

export const WEBP_QUALITY = 80;
export const AVIF_QUALITY = 55;
const MAX_INPUT_PIXELS = 50_000_000;

export interface Derivative {
  readonly width: DerivativeWidth;
  readonly format: DerivativeFormat;
  readonly contentType: string;
  readonly body: Buffer;
}

export interface ImageInfo {
  readonly width: number;
  readonly height: number;
  readonly format: string;
}

const CONTENT_TYPE: Readonly<Record<DerivativeFormat, string>> = {
  webp: 'image/webp',
  avif: 'image/avif',
};

/** Decodes once to prove the bytes are a real raster image; throws on polyglots and truncated files. */
export const inspectImage = async (input: Buffer): Promise<ImageInfo> => {
  const { width, height, format } = await sharp(input, {
    failOn: 'error',
    limitInputPixels: MAX_INPUT_PIXELS,
  })
    .rotate()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ info }) => ({ width: info.width, height: info.height, format: info.format }));
  return { width, height, format };
};

const encode = (pipeline: Sharp, format: DerivativeFormat): Sharp =>
  format === 'webp'
    ? pipeline.webp({ quality: WEBP_QUALITY })
    : pipeline.avif({ quality: AVIF_QUALITY });

/**
 * EXIF-rotates, strips every metadata block (Sharp does not copy metadata unless asked) and encodes
 * four widths × two formats. Small originals are never enlarged, but every name still exists.
 */
export const buildDerivatives = async (input: Buffer): Promise<readonly Derivative[]> => {
  const source = sharp(input, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  const results: Derivative[] = [];
  for (const width of DERIVATIVE_WIDTHS) {
    for (const format of DERIVATIVE_FORMATS) {
      const body = await encode(
        source.clone().resize({ width, withoutEnlargement: true }),
        format,
      ).toBuffer();
      results.push({ width, format, contentType: CONTENT_TYPE[format], body });
    }
  }
  return results;
};

/** Used by tests to prove derivatives carry no EXIF/ICC/XMP payloads. */
export const readMetadata = (input: Buffer): Promise<Metadata> => sharp(input).metadata();
