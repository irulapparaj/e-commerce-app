'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';


import { apiClient } from '@/lib/api/client';

import { ReauthDialog } from './ReauthDialog';

interface ExportDataCardProps {
  readonly email: string;
}

export function ExportDataCard({ email }: ExportDataCardProps) {
  const t = useTranslations('account');
  const [showReauth, setShowReauth] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requestExport = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.post('/account/export');
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to request export.');
    } finally {
      setBusy(false);
      setShowReauth(false);
    }
  };

  return (
    <div
      data-testid="export-data-card"
      style={{
        padding: 'var(--space-3)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-control)',
        background: 'var(--surface)',
      }}
    >
      <h3 style={{ fontSize: 'var(--text-small)', fontWeight: '600', marginBottom: 'var(--space-1)' }}>
        {t('exportData')}
      </h3>
      <p style={{ color: 'var(--muted)', fontSize: 'var(--text-small)', marginBottom: 'var(--space-2)' }}>
        {t('exportBody')}
      </p>
      {sent ? (
        <p role="status" data-testid="export-confirmation" style={{ color: 'var(--success)', fontSize: 'var(--text-small)' }}>
          {t('exportSent')}
        </p>
      ) : (
        <>
          {error !== null && (
            <p role="alert" style={{ color: 'var(--critical)', fontSize: 'var(--text-small)', marginBottom: 'var(--space-1)' }}>
              {error}
            </p>
          )}
          <button
            className="btn btn-secondary"
            onClick={() => setShowReauth(true)}
            disabled={busy}
            style={{ fontSize: 'var(--text-small)' }}
          >
            {t('exportRequest')}
          </button>
        </>
      )}
      <ReauthDialog
        open={showReauth}
        onClose={() => setShowReauth(false)}
        onSuccess={() => void requestExport()}
        email={email}
      />
    </div>
  );
}
