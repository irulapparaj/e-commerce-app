import { IMAGE_CONTENT_TYPES, type ImageContentType, isAllowedImageType } from '@pe/shared';

export {
  IMAGE_CONTENT_TYPES,
  IMAGE_MAX_BYTES,
  isAllowedImageType,
  type ImageContentType,
} from '@pe/shared';

/** Extension used in object keys per accepted content type. */
export const EXTENSION_BY_TYPE: Readonly<Record<ImageContentType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

const TYPE_BY_EXTENSION: ReadonlyMap<string, ImageContentType> = new Map(
  IMAGE_CONTENT_TYPES.map((type) => [EXTENSION_BY_TYPE[type], type]),
);

export const extensionFor = (contentType: ImageContentType): string =>
  EXTENSION_BY_TYPE[contentType];

export const typeForExtension = (extension: string): ImageContentType | undefined =>
  TYPE_BY_EXTENSION.get(extension.toLowerCase());

/** Magic-byte detection results that are acceptable. `file-type` reports jpg/png/webp/avif for these. */
export const isAcceptedDetection = (
  detected: { readonly ext: string; readonly mime: string } | undefined,
): boolean =>
  detected !== undefined &&
  isAllowedImageType(detected.mime) &&
  TYPE_BY_EXTENSION.has(detected.ext);
