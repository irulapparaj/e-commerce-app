'use client';

import { type KeyboardEvent, useState } from 'react';

interface TagsInputProps {
  readonly id: string;
  readonly value: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
  readonly disabled?: boolean;
  readonly describedBy?: string;
  readonly invalid?: boolean;
}

const SEPARATOR = /[,\n]/;

const addTags = (current: readonly string[], raw: string): readonly string[] => {
  const incoming = raw
    .split(SEPARATOR)
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '' && !current.includes(tag));
  return incoming.length === 0 ? current : [...current, ...incoming];
};

/** Chips with a free-text input: Enter or comma adds, Backspace on an empty input removes the last. */
export function TagsInput({
  id,
  value,
  onChange,
  disabled = false,
  describedBy,
  invalid = false,
}: TagsInputProps) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const next = addTags(value, draft);
    if (next !== value) onChange(next);
    setDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit();
      return;
    }
    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      event.preventDefault();
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="admin-chips" data-disabled={disabled ? 'true' : undefined}>
      <ul aria-label="Tags">
        {value.map((tag) => (
          <li key={tag} className="admin-chip" data-testid="tag-chip">
            {tag}
            <button
              type="button"
              className="admin-chip-remove"
              aria-label={`Remove tag ${tag}`}
              disabled={disabled}
              onClick={() => onChange(value.filter((entry) => entry !== tag))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <input
        id={id}
        type="text"
        className="admin-chip-input"
        value={draft}
        disabled={disabled}
        aria-describedby={describedBy}
        aria-invalid={invalid ? true : undefined}
        placeholder={value.length === 0 ? 'Add a tag and press Enter' : ''}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        data-testid="tags-input"
      />
    </div>
  );
}
