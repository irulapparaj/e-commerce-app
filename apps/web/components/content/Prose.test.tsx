// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Prose } from './Prose';

describe('Prose', () => {
  it('renders bullet lists with only <li> children so assistive tech reads them as lists', () => {
    const { container } = render(
      <Prose
        sections={[
          {
            heading: 'Not returnable',
            body: 'Intro line.\n- Opened consumables\n- Change-of-mind returns\n- **Tampered** seals\n\nA closing paragraph.',
          },
        ]}
      />,
    );

    const list = container.querySelector('ul');
    expect(list).not.toBeNull();
    expect(list?.querySelectorAll(':scope > li')).toHaveLength(3);
    expect(list?.querySelector('br')).toBeNull();
    expect([...(list?.children ?? [])].every((child) => child.tagName === 'LI')).toBe(true);
    expect(list?.querySelector('strong')).toHaveTextContent('Tampered');
    expect(container.textContent).toContain('A closing paragraph.');
  });

  it('keeps line breaks and paragraphs outside lists', () => {
    const { container } = render(
      <Prose sections={[{ body: 'First line\nsecond line\n\nNew paragraph' }]} />,
    );

    expect(container.querySelectorAll('br')).toHaveLength(1);
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });
});
