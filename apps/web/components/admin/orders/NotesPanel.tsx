'use client';

import { useState } from 'react';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import { formatDateTime } from '@/lib/admin/format';

import { FormField } from '../FormField';
import { useToast } from '../Toast';

interface Note {
  readonly at: string;
  readonly text: string;
  readonly author: string;
}

interface NotesPanelProps {
  readonly orderId: string;
  readonly initialNotes: readonly Note[];
  readonly onSuccess: () => void;
}

const NOTE_MIN = 3;
const NOTE_MAX = 500;

export function NotesPanel({ orderId, initialNotes, onSuccess }: NotesPanelProps) {
  const { notify } = useToast();
  const [notes, setNotes] = useState<readonly Note[]>(initialNotes);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const addNote = async () => {
    const trimmed = text.trim();
    if (trimmed.length < NOTE_MIN) return;
    setBusy(true);
    try {
      const { data } = await adminApi.post<{ notes: readonly Note[] }>(
        `/admin/orders/${orderId}/notes`,
        { text: trimmed },
      );
      setNotes(data.notes);
      setText('');
      notify('Note added', 'success');
      onSuccess();
    } catch (error) {
      notify(isAdminApiError(error) ? error.message : 'Could not add note', 'critical');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="order-notes-heading">
      <h2 id="order-notes-heading" className="admin-section-heading">
        Internal Notes
      </h2>
      {notes.length === 0 ? (
        <p className="admin-muted mb-4">No notes yet.</p>
      ) : (
        <ol className="admin-notes-list mb-4" data-testid="order-notes">
          {notes.map((note) => (
            <li key={note.at} className="admin-note" data-testid="order-note">
              <p className="admin-note-text">{note.text}</p>
              <footer className="admin-muted text-sm">
                {note.author} · {formatDateTime(note.at)}
              </footer>
            </li>
          ))}
        </ol>
      )}
      <div className="admin-note-composer">
        <FormField id="note-text" label="Add note">
          {(control) => (
            <textarea
              {...control}
              className="admin-input"
              rows={2}
              maxLength={NOTE_MAX}
              placeholder="Internal note…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              data-testid="note-input"
            />
          )}
        </FormField>
        <button
          type="button"
          className="admin-btn admin-btn-primary mt-2"
          onClick={addNote}
          disabled={busy || text.trim().length < NOTE_MIN}
          data-testid="note-submit"
        >
          {busy ? 'Adding…' : 'Add Note'}
        </button>
      </div>
    </section>
  );
}
