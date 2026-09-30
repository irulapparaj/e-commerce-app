// @vitest-environment jsdom
import { EMPTY_RICHTEXT_DOCUMENT, type RichTextDocument, richTextDocumentSchema } from '@pe/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { RichTextEditor } from './RichTextEditor';

/** ProseMirror measures selections; jsdom's Range has no layout, so return empty geometry. */
beforeAll(() => {
  const emptyRect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  Range.prototype.getBoundingClientRect = () => ({ ...emptyRect, toJSON: () => emptyRect });
  Range.prototype.getClientRects = () => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator],
  });
});

const HOSTILE_HTML = `
  <h1>Big title</h1>
  <p onclick="steal()">Hello <script>alert(1)</script><strong>bold</strong> <u>under</u>
    <a href="javascript:alert(1)">bad link</a> <a href="https://ok.test/x">good link</a>
    <img src="x" onerror="alert(1)">
  </p>
  <table><tr><td>cell</td></tr></table>
  <ul><li>one</li><li>two</li></ul>
  <style>body{display:none}</style>`;

const renderEditor = (props: Partial<Parameters<typeof RichTextEditor>[0]> = {}) => {
  const onChange = vi.fn<(doc: RichTextDocument) => void>();
  const view = render(
    <>
      <span id="desc-label">Description</span>
      <RichTextEditor
        id="desc"
        labelledBy="desc-label"
        value={EMPTY_RICHTEXT_DOCUMENT}
        onChange={onChange}
        {...props}
      />
    </>,
  );
  return { onChange, ...view };
};

const paste = (target: HTMLElement, html: string) =>
  fireEvent.paste(target, {
    clipboardData: {
      types: ['text/html', 'text/plain'],
      getData: (type: string) => (type === 'text/html' ? html : 'plain fallback'),
    },
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RichTextEditor', () => {
  it('drops scripts, handlers, unknown tags and unsafe links from pasted HTML so the JSON validates', async () => {
    const { onChange } = renderEditor();
    const textbox = await screen.findByRole('textbox', { name: 'Description' });

    paste(textbox, HOSTILE_HTML);

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const doc = onChange.mock.calls.at(-1)?.[0];
    const parsed = richTextDocumentSchema.safeParse(doc);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    const serialised = JSON.stringify(doc);
    expect(serialised).not.toMatch(/script|onerror|onclick|javascript:|underline|table|img/);
    expect(serialised).toContain('"bold"');
    expect(serialised).toContain('https://ok.test/x');
    expect(serialised).toContain('bulletList');
    expect(serialised).toContain('Big title');
    expect(serialised).not.toContain('"level":1');
  });

  it('exposes a keyboard-operable toolbar whose buttons report their pressed state', async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor();
    const textbox = await screen.findByRole('textbox', { name: 'Description' });
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
    const bold = screen.getByRole('button', { name: 'Bold' });
    paste(textbox, '<p>Hello world</p>');
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    fireEvent.keyDown(textbox, { key: 'a', ctrlKey: true });

    expect(bold).toHaveAttribute('aria-pressed', 'false');
    await user.click(bold);
    expect(bold).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.stringify(onChange.mock.calls.at(-1)?.[0])).toContain('"type":"bold"');

    await user.click(screen.getByRole('button', { name: 'Heading 2' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Heading 2' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(onChange).toHaveBeenCalled();
    const doc = onChange.mock.calls.at(-1)?.[0];
    expect(richTextDocumentSchema.safeParse(doc).success).toBe(true);
    expect(JSON.stringify(doc)).toContain('"level":2');

    screen.getByRole('button', { name: 'Heading 2' }).focus();
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Heading 3' })).toHaveFocus();
    fireEvent.keyDown(toolbar, { key: 'End' });
    expect(screen.getByRole('button', { name: 'Link' })).toHaveFocus();
    fireEvent.keyDown(toolbar, { key: 'Home' });
    expect(screen.getByRole('button', { name: 'Heading 2' })).toHaveFocus();
    fireEvent.keyDown(toolbar, { key: 'ArrowLeft' });
    expect(screen.getByRole('button', { name: 'Heading 2' })).toHaveFocus();
  });

  it('refuses non-https link URLs and accepts https ones', async () => {
    const user = userEvent.setup();
    const prompt = vi.spyOn(window, 'prompt');
    const { onChange } = renderEditor();
    const textbox = await screen.findByRole('textbox', { name: 'Description' });
    const link = screen.getByRole('button', { name: 'Link' });
    paste(textbox, '<p>Read more</p>');
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    fireEvent.keyDown(textbox, { key: 'a', ctrlKey: true });

    prompt.mockReturnValueOnce('http://insecure.test');
    await user.click(link);
    expect(screen.getByRole('alert')).toHaveTextContent('Links must start with https://');

    prompt.mockReturnValueOnce('https://secure.test/page');
    await user.click(link);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(link).toHaveAttribute('aria-pressed', 'true');
    const linked = JSON.stringify(onChange.mock.calls.at(-1)?.[0]);
    expect(linked).toContain('"href":"https://secure.test/page"');
    expect(linked).toContain('"rel":"noopener nofollow"');
    expect(richTextDocumentSchema.safeParse(onChange.mock.calls.at(-1)?.[0]).success).toBe(true);

    prompt.mockReturnValueOnce('');
    await user.click(link);
    await waitFor(() => expect(link).toHaveAttribute('aria-pressed', 'false'));

    prompt.mockReturnValueOnce(null);
    await user.click(link);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('disables editing and the toolbar, and follows an external value change', async () => {
    const { onChange, rerender } = renderEditor({ disabled: true });
    const textbox = await screen.findByRole('textbox', { name: 'Description' });

    expect(textbox).toHaveAttribute('contenteditable', 'false');
    expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled();

    const next: RichTextDocument = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'From the server' }] }],
    };
    rerender(
      <>
        <span id="desc-label">Description</span>
        <RichTextEditor id="desc" labelledBy="desc-label" value={next} onChange={onChange} />
      </>,
    );
    await waitFor(() => expect(textbox).toHaveTextContent('From the server'));
    expect(textbox).toHaveAttribute('contenteditable', 'true');
    expect(onChange).not.toHaveBeenCalled();
  });
});
