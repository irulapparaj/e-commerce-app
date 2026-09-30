// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { duplicateRowIndexes, rowsToRecord, SpecificationsEditor } from './SpecificationsEditor';
import { TagsInput } from './TagsInput';

const renderSpecs = (value: Record<string, string> = { Weight: '50 g', Fragrance: 'Rose' }) => {
  const onChange = vi.fn();
  render(<SpecificationsEditor id="specs" value={value} onChange={onChange} />);
  return onChange;
};

describe('SpecificationsEditor', () => {
  it('rejects duplicate keys inline and withholds the change until they are unique', async () => {
    const user = userEvent.setup();
    const onChange = renderSpecs();
    const second = screen.getByLabelText('Specification 2 name');

    await user.clear(second);
    await user.type(second, 'Weight');

    expect(screen.getByRole('alert')).toHaveTextContent('"Weight" is already used');
    expect(second).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Specification 1 name')).not.toHaveAttribute('aria-invalid');
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ Weight: 'Rose' }));

    await user.type(second, '2');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith({ Weight: '50 g', Weight2: 'Rose' });
  });

  it('adds, removes and reorders rows while preserving order in the emitted record', async () => {
    const user = userEvent.setup();
    const onChange = renderSpecs();

    await user.click(screen.getByTestId('spec-add'));
    expect(screen.getAllByTestId('spec-row')).toHaveLength(3);
    await user.type(screen.getByLabelText('Specification 3 name'), 'Origin');
    await user.type(screen.getByLabelText('Specification 3 value'), 'Mysore');
    expect(onChange).toHaveBeenLastCalledWith({
      Weight: '50 g',
      Fragrance: 'Rose',
      Origin: 'Mysore',
    });

    await user.click(screen.getByRole('button', { name: 'Move Origin up' }));
    expect(Object.keys(onChange.mock.calls.at(-1)?.[0] as object)).toEqual([
      'Weight',
      'Origin',
      'Fragrance',
    ]);
    expect(screen.getByRole('button', { name: 'Move Weight up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Fragrance down' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Move Weight down' }));
    expect(Object.keys(onChange.mock.calls.at(-1)?.[0] as object)).toEqual([
      'Origin',
      'Weight',
      'Fragrance',
    ]);

    await user.click(screen.getByRole('button', { name: 'Remove Weight' }));
    expect(onChange).toHaveBeenLastCalledWith({ Origin: 'Mysore', Fragrance: 'Rose' });
  });

  it('drops blank rows but keeps half-filled ones for validation', () => {
    expect(
      rowsToRecord([
        { id: 1, key: ' A ', value: ' 1 ' },
        { id: 2, key: '', value: '' },
        { id: 3, key: 'B', value: '' },
      ]),
    ).toEqual({ A: '1', B: '' });
    expect([
      ...duplicateRowIndexes([{ key: 'a' }, { key: ' a' }, { key: '' }, { key: '' }, { key: 'a' }]),
    ]).toEqual([1, 4]);
  });
});

/** TagsInput is controlled; the harness owns the value like React Hook Form would. */
function TagsHarness({ onChange }: { readonly onChange: (tags: readonly string[]) => void }) {
  const [tags, setTags] = useState<readonly string[]>(['rose']);
  return (
    <TagsInput
      id="tags"
      value={tags}
      onChange={(next) => {
        setTags(next);
        onChange(next);
      }}
    />
  );
}

describe('TagsInput', () => {
  it('adds on Enter or comma, ignores duplicates, removes via chip or Backspace', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TagsHarness onChange={onChange} />);
    const input = screen.getByTestId('tags-input');

    await user.type(input, 'jasmine{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(['rose', 'jasmine']);
    await user.type(input, 'rose,');
    expect(onChange).toHaveBeenCalledTimes(1);
    await user.type(input, 'a, b{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(['rose', 'jasmine', 'a', 'b']);

    await user.click(
      within(screen.getByRole('list', { name: 'Tags' })).getByRole('button', {
        name: 'Remove tag a',
      }),
    );
    expect(onChange).toHaveBeenLastCalledWith(['rose', 'jasmine', 'b']);

    await user.click(input);
    await user.keyboard('{Backspace}');
    expect(onChange).toHaveBeenLastCalledWith(['rose', 'jasmine']);

    await user.type(input, 'sandal');
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(['rose', 'jasmine', 'sandal']);
    expect(screen.getAllByTestId('tag-chip')).toHaveLength(3);
  });
});
