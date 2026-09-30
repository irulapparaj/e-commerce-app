import { AppError, type RichTextDocument, richTextDocumentSchema } from '@pe/shared';

export {
  EMPTY_RICHTEXT_DOCUMENT,
  isEmptyRichText,
  type RichTextDocument,
  richTextDocumentSchema,
  richTextToPlainText,
} from '@pe/shared';

/** Validates an untrusted Tiptap document (admin input or a stored row) against the allow-list. */
export const parseRichText = (value: unknown): RichTextDocument => {
  const result = richTextDocumentSchema.safeParse(value);
  if (result.success) return result.data;
  throw new AppError('VALIDATION', 'Invalid rich text document', {
    details: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  });
};
