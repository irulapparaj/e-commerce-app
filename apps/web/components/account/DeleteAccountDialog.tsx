'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useFocusTrap } from '@/hooks/useFocusTrap';
import { apiClient } from '@/lib/api/client';

import { ReauthDialog } from './ReauthDialog';

const CONFIRM_WORD = 'DELETE';

interface DeleteAccountDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly email: string;
}

export function DeleteAccountDialog({ open, onClose, email }: DeleteAccountDialogProps) {
  const t = useTranslations('account');
  const [showReauth, setShowReauth] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { modalRef } = useFocusTrap({ isOpen: open, onClose });

  const doDelete = async () => {
    setBusy(true);
    setError(null);
    setShowReauth(false);
    try {
      await apiClient.del('/account');
      window.location.assign('/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete account.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-heading"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--z-overlay)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--scrim)',
          padding: 'var(--gutter)',
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          ref={modalRef}
          style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-control)',
            padding: 'var(--space-5)',
            width: '100%',
            maxWidth: '26rem',
            boxShadow: 'var(--shadow-modal)',
          }}
        >
          <h2 id="delete-account-heading" style={{ fontSize: 'var(--text-h3)', marginBottom: 'var(--space-2)', color: 'var(--critical)' }}>
            {t('deleteAccount')}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 'var(--text-small)', marginBottom: 'var(--space-3)' }}>
            {t('deleteAccountBody')}
          </p>
          <label
            htmlFor="delete-confirm"
            style={{ display: 'block', fontSize: 'var(--text-small)', marginBottom: 'var(--space-1)' }}
          >
            {t('deleteConfirmLabel')}
          </label>
          <input
            id="delete-confirm"
            type="text"
            className="field"
            placeholder={t('deleteConfirmPlaceholder')}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
            style={{ marginBottom: 'var(--space-3)' }}
          />
          {error !== null && (
            <p role="alert" style={{ color: 'var(--critical)', fontSize: 'var(--text-small)', marginBottom: 'var(--space-2)' }}>
              {error}
            </p>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={busy} style={{ flex: 1 }}>
              {t('cancel')}
            </button>
            <button
              className="btn"
              onClick={() => setShowReauth(true)}
              disabled={busy || confirmation !== CONFIRM_WORD}
              style={{
                flex: 1,
                background: 'var(--critical)',
                color: 'white',
                border: '1px solid var(--critical)',
                borderRadius: 'var(--radius-control)',
                padding: 'var(--space-2) var(--space-3)',
                fontWeight: '600',
                cursor: confirmation !== CONFIRM_WORD ? 'not-allowed' : 'pointer',
                opacity: confirmation !== CONFIRM_WORD ? 0.5 : 1,
              }}
            >
              {t('deleteButton')}
            </button>
          </div>
        </div>
      </div>

      <ReauthDialog
        open={showReauth}
        onClose={() => setShowReauth(false)}
        onSuccess={() => void doDelete()}
        email={email}
      />
    </>
  );
}
