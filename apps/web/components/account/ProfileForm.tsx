'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';


import { apiClient } from '@/lib/api/client';

interface ProfileFormProps {
  readonly name: string | null;
  readonly phone: string | null;
}

export function ProfileForm({ name: initialName, phone: initialPhone }: ProfileFormProps) {
  const t = useTranslations('account');
  const [name, setName] = useState(initialName ?? '');
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      await apiClient.patch('/account/profile', {
        name: name.trim() || undefined,
        phone: phone.trim() || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void save(); }}
      aria-label="Edit profile"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxWidth: '28rem' }}
    >
      <div>
        <label htmlFor="profile-name" style={{ display: 'block', fontSize: 'var(--text-small)', marginBottom: 'var(--space-1)' }}>
          {t('name')}
        </label>
        <input
          id="profile-name"
          type="text"
          className="field"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      </div>
      <div>
        <label htmlFor="profile-phone" style={{ display: 'block', fontSize: 'var(--text-small)', marginBottom: 'var(--space-1)' }}>
          {t('phone')}
        </label>
        <input
          id="profile-phone"
          type="tel"
          className="field"
          pattern="\\+91[6-9][0-9]{9}"
          placeholder={t('phonePlaceholder')}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
        />
      </div>
      {error !== null && (
        <p role="alert" style={{ color: 'var(--critical)', fontSize: 'var(--text-small)' }}>{error}</p>
      )}
      {saved && (
        <p role="status" style={{ color: 'var(--success)', fontSize: 'var(--text-small)' }}>Changes saved</p>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy} style={{ alignSelf: 'flex-start' }}>
        {t('saveProfile')}
      </button>
    </form>
  );
}
