import {
  isHttpsUrl,
  RICHTEXT_HEADING_LEVELS,
  RICHTEXT_LINK_REL,
  RICHTEXT_LINK_TARGET,
} from '@pe/shared';
import type { Extensions } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';

/**
 * Mirror of `apps/api/src/modules/richtext/extensions.ts`: only the nodes and marks
 * `richTextDocumentSchema` accepts. Undo/redo, drop- and gap-cursor are editor-only conveniences
 * that never reach the JSON, so they stay on for the client.
 */
export const richTextExtensions = (): Extensions => [
  StarterKit.configure({
    blockquote: false,
    code: false,
    codeBlock: false,
    strike: false,
    underline: false,
    horizontalRule: false,
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
