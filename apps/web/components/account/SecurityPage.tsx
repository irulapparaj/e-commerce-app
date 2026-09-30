'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';


import { apiClient } from '@/lib/api/client';

import { DeleteAccountDialog } from './DeleteAccountDialog';
import { ExportDataCard } from './ExportDataCard';
import { SessionsList } from './SessionsList';

interface SessionData {
  readonly id: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly createdAt: string;
}

interface SecurityPageProps {
  readonly sessions: readonly SessionData[];
  readonly currentSessionId: string;
  readonly email: string;
}

export function SecurityPage({ sessions, currentSessionId, email }: SecurityPageProps) {
  const t = useTranslations('account');
  const [showDelete, setShowDelete] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

  const logoutEverywhere = async () => {
    setLogoutBusy(true);
    try {
      await apiClient.post('/auth/logout-all');
      window.location.assign('/');
    } finally {
      setLogoutBusy(false);
    }
  };

  return (
    <section aria-labelledby="security-heading" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div>
        <h2 id="security-heading" style={{ fontSize: 'var(--text-h3)', marginBottom: 'var(--space-3)' }}>
          {t('sessions')}
        </h2>
        <SessionsList sessions={sessions} currentSessionId={currentSessionId} />
        <button
          className="btn btn-ghost"
          onClick={() => void logoutEverywhere()}
          disabled={logoutBusy}
          style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-small)' }}
        >
          {t('logoutEverywhere')}
        </button>
      </div>

      <div>
        <h2 style={{ fontSize: 'var(--text-h3)', marginBottom: 'var(--space-3)' }}>Your data</h2>
        <ExportDataCard email={email} />
      </div>

      <div>
        <h2 style={{ fontSize: 'var(--text-h3)', marginBottom: 'var(--space-3)', color: 'var(--critical)' }}>
          Danger zone
        </h2>
        <div
          style={{
            padding: 'var(--space-3)',
            border: '1px solid var(--critical)',
            borderRadius: 'var(--radius-control)',
            background: 'var(--surface)',
          }}
        >
          <p style={{ fontSize: 'var(--text-small)', marginBottom: 'var(--space-2)', color: 'var(--muted)' }}>
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
          <button
            className="btn"
            onClick={() => setShowDelete(true)}
            style={{
              background: 'transparent',
              border: '1px solid var(--critical)',
              color: 'var(--critical)',
              borderRadius: 'var(--radius-control)',
              padding: 'var(--space-1) var(--space-3)',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: 'var(--text-small)',
            }}
          >
            {t('deleteAccount')}
          </button>
        </div>

        <DeleteAccountDialog
          open={showDelete}
          onClose={() => setShowDelete(false)}
          email={email}
        />
      </div>
    </section>
  );
}
