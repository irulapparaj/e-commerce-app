import { z } from 'zod';

/**
 * The only Tiptap nodes and marks the catalogue accepts (R16, DESIGN §11.3). The admin editor is
 * configured from these constants and the API validates every stored document against the schema,
 * so the two cannot drift.
 */
export const RICHTEXT_HEADING_LEVELS = [2, 3] as const;
export const RICHTEXT_ALLOWED_TAGS = [
  'p',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'a',
  'br',
] as const;
export const RICHTEXT_LINK_REL = 'noopener nofollow';
export const RICHTEXT_LINK_TARGET = '_blank';
export const RICHTEXT_MAX_BYTES = 50_000;
const HREF_MAX_LENGTH = 2048;
const LINK_TEXT_MAX_LENGTH = 200;
const REL_MAX_LENGTH = 80;
const ORDERED_LIST_START_MAX = 9999;

export const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

const httpsHref = z.string().max(HREF_MAX_LENGTH).refine(isHttpsUrl, 'Links must be https URLs');

const linkAttrsSchema = z.strictObject({
  href: httpsHref,
  target: z.literal(RICHTEXT_LINK_TARGET).nullable().optional(),
  rel: z.string().max(REL_MAX_LENGTH).nullable().optional(),
  class: z.null().optional(),
  title: z.string().max(LINK_TEXT_MAX_LENGTH).nullable().optional(),
});

const markSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('bold') }),
  z.strictObject({ type: z.literal('italic') }),
  z.strictObject({ type: z.literal('link'), attrs: linkAttrsSchema }),
]);

const textNodeSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string().min(1),
  marks: z.array(markSchema).optional(),
});

const hardBreakSchema = z.strictObject({ type: z.literal('hardBreak') });

const inlineSchema = z.discriminatedUnion('type', [textNodeSchema, hardBreakSchema]);

const paragraphSchema = z.strictObject({
  type: z.literal('paragraph'),
  content: z.array(inlineSchema).optional(),
});

const headingSchema = z.strictObject({
  type: z.literal('heading'),
  attrs: z.strictObject({
    level: z.union(RICHTEXT_HEADING_LEVELS.map((level) => z.literal(level))),
  }),
  content: z.array(inlineSchema).optional(),
});

export type RichTextInline = z.infer<typeof inlineSchema>;
export type RichTextParagraph = z.infer<typeof paragraphSchema>;
export type RichTextHeading = z.infer<typeof headingSchema>;

export interface RichTextListItem {
  readonly type: 'listItem';
  readonly content: readonly (RichTextParagraph | RichTextBulletList | RichTextOrderedList)[];
}

export interface RichTextBulletList {
  readonly type: 'bulletList';
  readonly content: readonly RichTextListItem[];
}

export interface RichTextOrderedList {
  readonly type: 'orderedList';
  readonly attrs?:
    { readonly start?: number | undefined; readonly type?: null | undefined } | undefined;
  readonly content: readonly RichTextListItem[];
}

const listItemSchema: z.ZodType<RichTextListItem> = z.lazy(() =>
  z.strictObject({
    type: z.literal('listItem'),
    content: z.array(z.union([paragraphSchema, bulletListSchema, orderedListSchema])).min(1),
  }),
);

const bulletListSchema: z.ZodType<RichTextBulletList> = z.lazy(() =>
  z.strictObject({ type: z.literal('bulletList'), content: z.array(listItemSchema).min(1) }),
);

const orderedListSchema: z.ZodType<RichTextOrderedList> = z.lazy(() =>
  z.strictObject({
    type: z.literal('orderedList'),
    attrs: z
      .strictObject({
        start: z.number().int().min(1).max(ORDERED_LIST_START_MAX).optional(),
        type: z.null().optional(),
      })
      .optional(),
    content: z.array(listItemSchema).min(1),
  }),
);

const blockSchema = z.union([paragraphSchema, headingSchema, bulletListSchema, orderedListSchema]);

export type RichTextBlock = z.infer<typeof blockSchema>;

export const richTextDocumentSchema = z
  .strictObject({
    type: z.literal('doc'),
    content: z.array(blockSchema).optional(),
  })
  .refine((doc) => JSON.stringify(doc).length <= RICHTEXT_MAX_BYTES, {
    message: `Description must be at most ${RICHTEXT_MAX_BYTES} bytes`,
  });

export type RichTextDocument = z.infer<typeof richTextDocumentSchema>;

export const EMPTY_RICHTEXT_DOCUMENT: RichTextDocument = { type: 'doc', content: [] };

/** `Product.description` defaults to `{}` at the database level; treat that as an empty document. */
export const isEmptyRichText = (value: unknown): boolean => {
  if (value === null || value === undefined || typeof value !== 'object') return true;
  const doc = value as { readonly type?: unknown; readonly content?: readonly unknown[] };
  if (Object.keys(doc).length === 0) return true;
  return doc.type === 'doc' && (doc.content?.length ?? 0) === 0;
};

/** Plain-text projection used for previews and search snippets; never rendered as HTML. */
export const richTextToPlainText = (doc: RichTextDocument): string => {
  const inline = (nodes: readonly RichTextInline[] | undefined): string =>
    (nodes ?? []).map((node) => (node.type === 'text' ? node.text : '\n')).join('');
  const block = (node: RichTextBlock): string => {
    if (node.type === 'paragraph' || node.type === 'heading') return inline(node.content);
    return node.content
      .map((item) => item.content.map((child) => block(child)).join('\n'))
      .join('\n');
  };
  return (doc.content ?? []).map(block).join('\n').trim();
};
