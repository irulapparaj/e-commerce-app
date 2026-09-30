import {
  isHttpsUrl,
  RICHTEXT_HEADING_LEVELS,
  RICHTEXT_LINK_REL,
  RICHTEXT_LINK_TARGET,
} from '@pe/shared';
import type { Extensions } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';

/**
 * Exactly the nodes/marks `richTextDocumentSchema` allows: paragraph, heading 2–3, bullet/ordered
 * lists, bold, italic, https links, hard breaks. The admin editor mirrors this configuration.
 */
export const richTextExtensions = (): Extensions => [
  StarterKit.configure({
    blockquote: false,
    code: false,
    codeBlock: false,
    strike: false,
    underline: false,
    horizontalRule: false,
    dropcursor: false,
    gapcursor: false,
    undoRedo: false,
    trailingNode: false,
    listKeymap: false,
    heading: { levels: [...RICHTEXT_HEADING_LEVELS] },
    link: {
      openOnClick: false,
      autolink: false,
      linkOnPaste: false,
      protocols: [],
      defaultProtocol: 'https',
      HTMLAttributes: { rel: RICHTEXT_LINK_REL, target: RICHTEXT_LINK_TARGET },
      isAllowedUri: (url) => isHttpsUrl(url),
    },
  }),
];
