import type { ObjectStoragePort } from '../../ports/object-storage';

export const DERIVATIVE_WIDTHS = [320, 640, 1024, 1600] as const;
export const DERIVATIVE_FORMATS = ['webp', 'avif'] as const;
export type DerivativeWidth = (typeof DERIVATIVE_WIDTHS)[number];
export type DerivativeFormat = (typeof DERIVATIVE_FORMATS)[number];

export const DEFAULT_IMAGE_WIDTH: DerivativeWidth = 1024;
export const THUMBNAIL_WIDTH: DerivativeWidth = 320;
export const CATEGORY_IMAGE_WIDTH: DerivativeWidth = 640;
export const PRESIGNED_GET_TTL_SECONDS = 3600;

export interface ImageUrls {
  readonly alt: string;
  /** 1024 px WebP for `<img src>` and legacy consumers. */
  readonly src: string;
  readonly srcset: { readonly webp: string; readonly avif: string };
}

export interface ImageUrlBuilder {
  url(base: string, width: DerivativeWidth, format: DerivativeFormat): Promise<string>;
  imageUrls(base: string, alt: string): Promise<ImageUrls>;
}

export interface ImageUrlBuilderOptions {
  readonly publicBaseUrl?: string | undefined;
  readonly storage: ObjectStoragePort;
  readonly bucket: string;
}

/** Derivative names are deterministic so only the base key is stored (P04 review note). */
export const derivativeKey = (
  base: string,
  width: DerivativeWidth,
  format: DerivativeFormat,
): string => `${base}-${width}.${format}`;

export const createImageUrlBuilder = (options: ImageUrlBuilderOptions): ImageUrlBuilder => {
  const publicBase = options.publicBaseUrl?.replace(/\/+$/, '');

  const url: ImageUrlBuilder['url'] = async (base, width, format) => {
    const key = derivativeKey(base, width, format);
    if (publicBase !== undefined) return `${publicBase}/${key}`;
    const signed = await options.storage.presignGet({
      bucket: options.bucket,
      key,
      expiresSec: PRESIGNED_GET_TTL_SECONDS,
    });
    return signed.url;
  };

  const srcsetFor = async (base: string, format: DerivativeFormat): Promise<string> => {
    const entries = await Promise.all(
      DERIVATIVE_WIDTHS.map(async (width) => `${await url(base, width, format)} ${width}w`),
    );
    return entries.join(', ');
  };

  return {
    url,
    imageUrls: async (base, alt) => ({
      alt,
      src: await url(base, DEFAULT_IMAGE_WIDTH, 'webp'),
      srcset: { webp: await srcsetFor(base, 'webp'), avif: await srcsetFor(base, 'avif') },
    }),
  };
};
