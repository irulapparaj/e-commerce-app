import { describe, expect, it } from 'vitest';

import { renderRichText } from './render';
import { SANITIZE_OPTIONS, sanitizeRichText } from './sanitize';
import { parseRichText } from './schema';

const XSS_VECTORS: readonly string[] = [
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)><rect/></svg>',
  '<p><a href="javascript:alert(1)">x</a></p>',
  '<p><a href="&#106;avascript:alert(1)">x</a></p>',
  '<p><a href="JaVaScRiPt:alert(1)">x</a></p>',
  '<p><a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a></p>',
  '<p><a href="//evil.example/x">x</a></p>',
  '<p><a href="http://evil.example/x">x</a></p>',
  '<p><a href="https://ok.example" onclick="alert(1)">x</a></p>',
  '<p><em><a href="https://ok.example"><a href="javascript:alert(1)">nested</a></a></em></p>',
  '<p style="background:url(javascript:alert(1))">x</p>',
  '<script>alert(1)</script><p>after</p>',
  '<iframe src="https://evil.example"></iframe>',
  '<p><strong onmouseover="alert(1)">x</strong></p>',
  '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
  '<p><script>alert(1)</script></p>',
  '<a href="java\tscript:alert(1)">x</a>',
];

describe('sanitizeRichText', () => {
  it.each(XSS_VECTORS)('neutralises %s', (vector) => {
    const output = sanitizeRichText(vector);

    expect(output).not.toMatch(/on[a-z]+=/i);
    expect(output).not.toMatch(/javascript:/i);
    expect(output).not.toMatch(/data:/i);
    expect(output).not.toMatch(/<script|<svg|<img|<iframe|<math|style=/i);
    expect(output).not.toMatch(/href="(?!https:)/);
  });

  it('keeps allowed markup and forces safe link attributes', () => {
    const output = sanitizeRichText(
      '<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em><br>next</p><ul><li>one</li></ul><ol start="3"><li>three</li></ol><p><a href="https://example.com/x?y=1" rel="x" target="_self" class="c">link</a></p>',
    );

    expect(output).toBe(
      '<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em><br />next</p><ul><li>one</li></ul><ol start="3"><li>three</li></ol><p><a href="https://example.com/x?y=1" rel="noopener nofollow" target="_blank">link</a></p>',
    );
  });

  it('drops h1/h4, tables and inline styles but keeps their text', () => {
    expect(
      sanitizeRichText(
        '<h1>big</h1><h4>small</h4><table><tr><td>cell</td></tr></table><span style="color:red">red</span>',
      ),
    ).toBe('bigsmallcellred');
  });

  it('pins the allow-list (widening it is a reviewed change)', () => {
    expect({
      tags: SANITIZE_OPTIONS.allowedTags,
      attributes: SANITIZE_OPTIONS.allowedAttributes,
      schemes: SANITIZE_OPTIONS.allowedSchemes,
    }).toMatchInlineSnapshot(`
      {
        "attributes": {
          "a": [
            "href",
            "rel",
            "target",
          ],
          "ol": [
            "start",
          ],
        },
        "schemes": [
          "https",
        ],
        "tags": [
          "p",
          "h2",
          "h3",
          "ul",
          "ol",
          "li",
          "strong",
          "em",
          "a",
          "br",
        ],
      }
    `);
  });
});

describe('renderRichText', () => {
  const doc = parseRichText({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Camphor' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Pure', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' & ' },
          { type: 'text', text: 'natural', marks: [{ type: 'italic' }] },
          { type: 'hardBreak' },
          {
            type: 'text',
            text: 'shop',
            marks: [{ type: 'link', attrs: { href: 'https://example.com/?a=1&b=2' } }],
          },
        ],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '<b>not html</b>' }] }],
          },
        ],
      },
      {
        type: 'orderedList',
        attrs: { start: 2 },
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }],
          },
        ],
      },
    ],
  });

  it('renders the allowed nodes to sanitised HTML with escaped text', () => {
    expect(renderRichText(doc)).toBe(
      '<h2>Camphor</h2><p><strong>Pure</strong> &amp; <em>natural</em><br />' +
        '<a href="https://example.com/?a=1&amp;b=2" rel="noopener nofollow" target="_blank">shop</a></p>' +
        '<ul><li><p>&lt;b&gt;not html&lt;/b&gt;</p></li></ul><ol start="2"><li><p>two</p></li></ol>',
    );
  });

  it('renders empty documents as an empty string', () => {
    expect(renderRichText({ type: 'doc', content: [] })).toBe('');
    expect(renderRichText(null)).toBe('');
    expect(renderRichText(undefined)).toBe('');
  });

  it('strips unsafe hrefs even when a document bypassed schema validation', () => {
    const unsafe = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    };

    expect(renderRichText(unsafe as never)).toBe('<p>x</p>');
  });

  it('parseRichText throws VALIDATION with field paths', () => {
    const thrown = (() => {
      try {
        parseRichText({ type: 'doc', content: [{ type: 'image' }] });
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect(thrown).toMatchObject({
      code: 'VALIDATION',
      details: [expect.objectContaining({ path: expect.stringContaining('content') })],
    });
  });
});
