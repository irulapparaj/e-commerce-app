'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';


import { apiClient } from '@/lib/api/client';

interface Session {
  readonly id: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly createdAt: string;
}

interface SessionsListProps {
  readonly sessions: readonly Session[];
  readonly currentSessionId: string;
}

const DEVICE_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

export function SessionsList({ sessions, currentSessionId }: SessionsListProps) {
  const t = useTranslations('account');
  const [items, setItems] = useState(sessions);
  const [busy, setBusy] = useState<string | null>(null);

  const revoke = async (sessionId: string) => {
    setBusy(sessionId);
    try {
      await apiClient.del(`/account/sessions/${sessionId}`);
      setItems((prev) => prev.filter((s) => s.id !== sessionId));
    } catch {
      // silently ignore
    } finally {
      setBusy(null);
    }
  };

  return (
    <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {items.map((session) => {
        const isCurrent = session.id === currentSessionId;
        return (
          <li
            key={session.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 'var(--space-2) var(--space-3)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-control)',
              background: 'var(--surface)',
              gap: 'var(--space-2)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: isCurrent ? '600' : '400', fontSize: 'var(--text-small)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {session.ip ?? 'Unknown device'}
                {isCurrent && (
                  <span
                    style={{
                      marginLeft: 'var(--space-1)',
                      fontSize: 'var(--text-caption)',
                      padding: '1px 6px',
                      background: 'var(--accent)',
                      color: 'var(--accent-contrast)',
                      borderRadius: '999px',
                    }}
                  >
                    {t('currentSession')}
                  </span>
                )}
              </p>
              <p style={{ color: 'var(--muted)', fontSize: 'var(--text-caption)', marginTop: '2px' }}>
                {DEVICE_FORMATTER.format(new Date(session.createdAt))}
              </p>
            </div>
            {!isCurrent && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: 'var(--text-caption)', flexShrink: 0 }}
                onClick={() => void revoke(session.id)}
                disabled={busy === session.id}
                aria-label={`Sign out of session from ${session.ip ?? 'unknown device'}`}
              >
                {t('revokeSession')}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
