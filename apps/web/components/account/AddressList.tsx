'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';


import { apiClient } from '@/lib/api/client';

interface Address {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
  readonly state: string;
  readonly pincode: string;
  readonly isDefault: boolean;
}

interface AddressListProps {
  readonly addresses: readonly Address[];
}

const MAX_ADDRESSES = 10;

export function AddressList({ addresses: initialAddresses }: AddressListProps) {
  const t = useTranslations('account');
  const [addresses, setAddresses] = useState(initialAddresses);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const setDefault = async (id: string) => {
    setBusy(id);
    try {
      // H-20: use dedicated /default endpoint (PATCH with isDefault: true was wrong verb/shape)
      await apiClient.post(`/account/addresses/${id}/default`, {});
      setAddresses((prev) =>
        prev.map((a) => ({ ...a, isDefault: a.id === id })),
      );
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = async () => {
    if (deleteId === null) return;
    setBusy(deleteId);
    try {
      await apiClient.del(`/account/addresses/${deleteId}`);
      setAddresses((prev) => prev.filter((a) => a.id !== deleteId));
    } finally {
      setBusy(null);
      setDeleteId(null);
    }
  };

  return (
    <div>
      {addresses.length === MAX_ADDRESSES && (
        <p style={{ color: 'var(--warning)', fontSize: 'var(--text-small)', marginBottom: 'var(--space-2)' }}>
          {t('maxAddresses')}
        </p>
      )}

      {addresses.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>{t('noAddresses')}</p>
      ) : (
        <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {addresses.map((address) => (
            <li
              key={address.id}
              style={{
                padding: 'var(--space-3)',
                border: `1px solid ${address.isDefault ? 'var(--accent)' : 'var(--hairline)'}`,
                borderRadius: 'var(--radius-control)',
                background: 'var(--surface)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                <address style={{ fontStyle: 'normal', fontSize: 'var(--text-small)', lineHeight: 1.6 }}>
                  <p style={{ fontWeight: '600' }}>
                    {address.name}
                    {address.isDefault && (
                      <span style={{ marginLeft: 'var(--space-1)', fontSize: 'var(--text-caption)', padding: '1px 6px', background: 'var(--accent)', color: 'var(--accent-contrast)', borderRadius: '999px' }}>
                        Default
                      </span>
                    )}
                  </p>
                  <p style={{ color: 'var(--muted)' }}>{address.phone}</p>
                  <p>{address.line1}{address.line2 ? `, ${address.line2}` : ''}</p>
                  <p>{address.city}, {address.state} — {address.pincode}</p>
                </address>
                <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
                  {!address.isDefault && (
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 'var(--text-caption)' }}
                      onClick={() => void setDefault(address.id)}
                      disabled={busy === address.id}
                    >
                      Set default
                    </button>
                  )}
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 'var(--text-caption)', color: 'var(--critical)' }}
                    onClick={() => setDeleteId(address.id)}
                    disabled={busy === address.id}
                  >
                    {t('deleteAddress')}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {deleteId !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-addr-heading"
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
        >
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-control)', padding: 'var(--space-4)', maxWidth: '22rem', width: '100%', boxShadow: 'var(--shadow-modal)' }}>
            <h3 id="delete-addr-heading" style={{ fontSize: 'var(--text-h3)', marginBottom: 'var(--space-2)' }}>
              {t('confirmDelete')}
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: 'var(--text-small)', marginBottom: 'var(--space-3)' }}>
              {t('deleteConfirmBody')}
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteId(null)} style={{ flex: 1 }}>
                {t('cancel')}
              </button>
              <button className="btn btn-primary" onClick={() => void confirmDelete()} disabled={busy === deleteId} style={{ flex: 1, background: 'var(--critical)', border: '1px solid var(--critical)' }}>
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
