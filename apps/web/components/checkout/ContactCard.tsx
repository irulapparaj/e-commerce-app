'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

interface ContactCardProps {
  readonly email: string;
  readonly phone: string;
  readonly onSave: (phone: string) => void;
}

export function ContactCard({ email, phone, onSave }: ContactCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(phone);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 0));
    onSave(draft);
    setEditing(false);
    setSaving(false);
  };

  return (
    <div className="rounded-card border border-hairline p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-small text-muted">Contact</p>
          <p className="font-medium">{email}</p>
        </div>
        {!editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>

      {editing ? (
        <div className="mt-3 space-y-3">
          <Field label="Mobile number" required>
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              type="tel"
              pattern="[6-9][0-9]{9}"
            />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" loading={saving} onClick={handleSave}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setDraft(phone); setEditing(false); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-muted">{phone !== '' ? phone : 'No mobile number yet'}</p>
      )}
    </div>
  );
}
