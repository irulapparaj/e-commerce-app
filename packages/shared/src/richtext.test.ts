import { describe, expect, it } from 'vitest';

import {
  EMPTY_RICHTEXT_DOCUMENT,
  isEmptyRichText,
  isHttpsUrl,
  RICHTEXT_MAX_BYTES,
  richTextDocumentSchema,
  richTextToPlainText,
} from './richtext';

const text = (value: string, marks?: readonly object[]) => ({
  type: 'text',
  text: value,
  ...(marks === undefined ? {} : { marks }),
});
const paragraph = (...content: object[]) => ({ type: 'paragraph', content });

const valid = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [text('Camphor')] },
    paragraph(
      text('Pure ', [{ type: 'bold' }]),
      text('camphor'),
      { type: 'hardBreak' },
      text('tablets'),
    ),
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [paragraph(text('one'))] },
        {
          type: 'listItem',
          content: [
            paragraph(text('two')),
            {
              type: 'orderedList',
              attrs: { start: 1, type: null },
              content: [{ type: 'listItem', content: [paragraph(text('nested'))] }],
            },
          ],
        },
      ],
    },
    paragraph(
      text('link', [
        {
          type: 'link',
          attrs: { href: 'https://example.com/a', target: '_blank', rel: 'noopener', class: null },
        },
      ]),
    ),
  ],
};

describe('richTextDocumentSchema', () => {
  it('accepts every allowed node and mark, including nested lists', () => {
    expect(richTextDocumentSchema.safeParse(valid).success).toBe(true);
    expect(richTextDocumentSchema.safeParse(EMPTY_RICHTEXT_DOCUMENT).success).toBe(true);
    expect(richTextDocumentSchema.safeParse({ type: 'doc' }).success).toBe(true);
  });

  it.each([
    ['script node', { type: 'doc', content: [{ type: 'script', content: [text('x')] }] }],
    [
      'image node',
      { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://x/y.png' } }] },
    ],
    [
      'heading level 1',
      { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [text('x')] }] },
    ],
    ['unknown mark', { type: 'doc', content: [paragraph(text('x', [{ type: 'underline' }]))] }],
    [
      'javascript link',
      {
        type: 'doc',
        content: [paragraph(text('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]))],
      },
    ],
    [
      'data link',
      {
        type: 'doc',
        content: [paragraph(text('x', [{ type: 'link', attrs: { href: 'data:text/html,hi' } }]))],
      },
    ],
    [
      'http link',
      {
        type: 'doc',
        content: [paragraph(text('x', [{ type: 'link', attrs: { href: 'http://example.com' } }]))],
      },
    ],
    [
      'unicode-escaped scheme',
      {
        type: 'doc',
        content: [paragraph(text('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]))],
      },
    ],
    [
      'extra attrs on link',
      {
        type: 'doc',
        content: [
          paragraph(text('x', [{ type: 'link', attrs: { href: 'https://a.b', onclick: 'x' } }])),
        ],
      },
    ],
    [
      'extra keys on node',
      { type: 'doc', content: [{ ...paragraph(text('x')), attrs: { style: 'color:red' } }] },
    ],
    ['empty text', { type: 'doc', content: [paragraph({ type: 'text', text: '' })] }],
    ['empty list', { type: 'doc', content: [{ type: 'bulletList', content: [] }] }],
    ['wrong root', { type: 'paragraph', content: [] }],
  ])('rejects %s', (_label, doc) => {
    expect(richTextDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it('rejects documents above the byte cap', () => {
    const big = { type: 'doc', content: [paragraph(text('a'.repeat(RICHTEXT_MAX_BYTES)))] };

    expect(richTextDocumentSchema.safeParse(big).success).toBe(false);
  });
});

describe('helpers', () => {
  it('detects empty documents including the {} database default', () => {
    expect(isEmptyRichText({})).toBe(true);
    expect(isEmptyRichText(null)).toBe(true);
    expect(isEmptyRichText(undefined)).toBe(true);
    expect(isEmptyRichText('x')).toBe(true);
    expect(isEmptyRichText({ type: 'doc', content: [] })).toBe(true);
    expect(isEmptyRichText({ type: 'doc' })).toBe(true);
    expect(isEmptyRichText(valid)).toBe(false);
    expect(isEmptyRichText({ type: 'paragraph' })).toBe(false);
  });

  it('projects a document to plain text', () => {
    expect(richTextToPlainText(richTextDocumentSchema.parse(valid))).toBe(
      'Camphor\nPure camphor\ntablets\none\ntwo\nnested\nlink',
    );
    expect(richTextToPlainText(EMPTY_RICHTEXT_DOCUMENT)).toBe('');
  });

  it('only treats https URLs as safe hrefs', () => {
    expect(isHttpsUrl('https://example.com')).toBe(true);
    expect(isHttpsUrl('http://example.com')).toBe(false);
    expect(isHttpsUrl('not a url')).toBe(false);
  });
});
