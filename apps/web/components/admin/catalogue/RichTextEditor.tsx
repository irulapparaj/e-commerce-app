'use client';

import { isHttpsUrl, type RichTextDocument } from '@pe/shared';
import type { JSONContent } from '@tiptap/core';
import { type Editor, EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react';

import { richTextExtensions } from '@/lib/admin/richtext-extensions';

interface RichTextEditorProps {
  readonly id: string;
  readonly value: RichTextDocument;
  readonly onChange: (doc: RichTextDocument) => void;
  readonly labelledBy: string;
  readonly describedBy?: string;
  readonly invalid?: boolean;
  readonly disabled?: boolean;
  readonly placeholder?: string;
}

interface Tool {
  readonly key: string;
  readonly label: string;
  readonly title: string;
  readonly isActive: (editor: Editor) => boolean;
  readonly run: (editor: Editor) => void;
}

const LINK_PROMPT = 'Link URL (https only; leave empty to remove the link)';
const LINK_ERROR = 'Links must start with https://';

const TOOLS: readonly Tool[] = [
  {
    key: 'h2',
    label: 'H2',
    title: 'Heading 2',
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    key: 'h3',
    label: 'H3',
    title: 'Heading 3',
    isActive: (editor) => editor.isActive('heading', { level: 3 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    key: 'bold',
    label: 'B',
    title: 'Bold',
    isActive: (editor) => editor.isActive('bold'),
    run: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    key: 'italic',
    label: 'I',
    title: 'Italic',
    isActive: (editor) => editor.isActive('italic'),
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    key: 'bulletList',
    label: '•',
    title: 'Bullet list',
    isActive: (editor) => editor.isActive('bulletList'),
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    key: 'orderedList',
    label: '1.',
    title: 'Numbered list',
    isActive: (editor) => editor.isActive('orderedList'),
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
];

const sameDoc = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The schema type is a strict subset of Tiptap's JSON; only optionality differs. */
const asContent = (doc: RichTextDocument): JSONContent => doc as unknown as JSONContent;

/** Roving focus inside the toolbar: arrows move, Home/End jump. */
const onToolbarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
  );
  const index = buttons.findIndex((button) => button === document.activeElement);
  if (index === -1) return;
  const last = buttons.length - 1;
  const target =
    event.key === 'ArrowRight'
      ? Math.min(last, index + 1)
      : event.key === 'ArrowLeft'
        ? Math.max(0, index - 1)
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : null;
  if (target === null) return;
  event.preventDefault();
  buttons[target]?.focus();
};

/** Tiptap restricted to the P04 schema; emits the document JSON on every update. */
export function RichTextEditor({
  id,
  value,
  onChange,
  labelledBy,
  describedBy,
  invalid = false,
  disabled = false,
  placeholder = 'Describe the product…',
}: RichTextEditorProps) {
  const [linkError, setLinkError] = useState<string | null>(null);
  const extensions = useMemo(richTextExtensions, []);
  const editor = useEditor({
    extensions,
    content: asContent(value),
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => onChange(current.getJSON() as RichTextDocument),
    editorProps: {
      attributes: {
        id,
        class: 'admin-editor-content',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': labelledBy,
        'data-placeholder': placeholder,
        ...(describedBy === undefined ? {} : { 'aria-describedby': describedBy }),
        ...(invalid ? { 'aria-invalid': 'true' } : {}),
      },
    },
  });

  const active = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current === null
        ? null
        : {
            tools: TOOLS.map((tool) => tool.isActive(current)),
            link: current.isActive('link'),
          },
  });

  useEffect(() => {
    if (editor === null || sameDoc(editor.getJSON(), value)) return;
    editor.commands.setContent(asContent(value), { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    // Tiptap emits `update` from setEditable by default; editability is not a content change.
    if (editor !== null && editor.isEditable === disabled) editor.setEditable(!disabled, false);
  }, [editor, disabled]);

  const setLink = () => {
    if (editor === null) return;
    const current = (editor.getAttributes('link') as { href?: string }).href ?? '';
    const input = window.prompt(LINK_PROMPT, current);
    if (input === null) return;
    const href = input.trim();
    if (href === '') {
      setLinkError(null);
      editor.chain().focus().unsetLink().run();
      return;
    }
    if (!isHttpsUrl(href)) {
      setLinkError(LINK_ERROR);
      return;
    }
    setLinkError(null);
    editor.chain().focus().setLink({ href }).run();
  };

  const ready = editor !== null && active !== null;

  return (
    <div className="admin-editor" data-invalid={invalid ? 'true' : undefined}>
      <div
        role="toolbar"
        aria-label="Formatting"
        aria-controls={id}
        className="admin-editor-toolbar"
        onKeyDown={onToolbarKeyDown}
      >
        {TOOLS.map((tool, index) => (
          <button
            key={tool.key}
            type="button"
            className="admin-editor-btn"
            title={tool.title}
            aria-label={tool.title}
            aria-pressed={ready ? active.tools[index] === true : false}
            disabled={!ready || disabled}
            onClick={() => (editor === null ? undefined : tool.run(editor))}
            data-testid={`rte-${tool.key}`}
          >
            {tool.label}
          </button>
        ))}
        <button
          type="button"
          className="admin-editor-btn"
          title="Link"
          aria-label="Link"
          aria-pressed={ready ? active.link : false}
          disabled={!ready || disabled}
          onClick={setLink}
          data-testid="rte-link"
        >
          Link
        </button>
      </div>
      <EditorContent editor={editor} />
      {linkError !== null && (
        <p className="admin-error" role="alert" style={{ padding: '0 0.75rem 0.5rem' }}>
          {linkError}
        </p>
      )}
    </div>
  );
}
