import { RICHTEXT_ALLOWED_TAGS, RICHTEXT_LINK_REL, RICHTEXT_LINK_TARGET } from '@pe/shared';
import sanitizeHtml from 'sanitize-html';

const isSafeHref = (href: string | undefined): href is string =>
  href !== undefined &&
  (() => {
    try {
      return new URL(href).protocol === 'https:';
    } catch {
      return false;
    }
  })();

/**
 * The allow-list the storefront relies on (R16). Widening it is a reviewed change: a snapshot test
 * pins the tag list and the link attributes.
 */
export const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...RICHTEXT_ALLOWED_TAGS],
  allowedAttributes: { a: ['href', 'rel', 'target'], ol: ['start'] },
  allowedSchemes: ['https'],
  allowedSchemesByTag: { a: ['https'] },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'template', 'iframe'],
  transformTags: {
    // Links either become https links with our fixed rel/target or lose their anchor (text stays).
    a: (tagName, attribs) =>
      isSafeHref(attribs.href)
        ? {
            tagName,
            attribs: { href: attribs.href, rel: RICHTEXT_LINK_REL, target: RICHTEXT_LINK_TARGET },
          }
        : { tagName: 'span', attribs: {} },
  },
};

export const sanitizeRichText = (html: string): string => sanitizeHtml(html, SANITIZE_OPTIONS);
