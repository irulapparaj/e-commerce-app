import { isEmptyRichText, type RichTextDocument } from '@pe/shared';
import { generateHTML } from '@tiptap/html';

import { richTextExtensions } from './extensions';
import { sanitizeRichText } from './sanitize';

/** Tiptap JSON → HTML → sanitised HTML. The storefront only ever receives the output of this. */
export const renderRichText = (doc: RichTextDocument | null | undefined): string => {
  if (doc === null || doc === undefined || isEmptyRichText(doc)) return '';
  const html = generateHTML(doc as Parameters<typeof generateHTML>[0], richTextExtensions());
  return sanitizeRichText(html);
};
