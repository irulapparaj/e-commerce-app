'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import type {
  CustomerDetailDto,
  CustomerMutation,
  CustomerSession,
} from '@/lib/admin/customer-types';

import { EmptyState } from '../EmptyState';
import type { AdminRole } from '../Nav.config';
import { useToast } from '../Toast';

import { AdminAddressList } from './AdminAddressList';
import { CustomerHeader } from './CustomerHeader';
import { DisableDialog } from './DisableDialog';
import { DpdpActions } from './DpdpActions';
import { RevealDialog } from './RevealDialog';
import { SessionsTable } from './SessionsTable';

interface CustomerDetailProps {
  readonly customer: CustomerDetailDto;
  readonly sessions: readonly CustomerSession[];
  readonly role: AdminRole;
}

/** Client state for the profile page: the header actions update the customer in place. */
export function CustomerDetail({ customer: initial, sessions, role }: CustomerDetailProps) {
  const router = useRouter();
  const { notify } = useToast();
  const [customer, setCustomer] = useState(initial);
  const [synced, setSynced] = useState(initial);
  if (synced !== initial) {
    setSynced(initial);
    setCustomer(initial);
  }
  const [revealOpen, setRevealOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    setBusy(true);
    try {
      const { data } = await adminApi.post<CustomerMutation>(
        `/admin/customers/${customer.id}/enable`,
      );
      setCustomer(data.customer);
      notify('Account enabled', 'success');
      router.refresh();
    } catch (error) {
      notify(isAdminApiError(error) ? error.message : 'Something went wrong', 'critical');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <CustomerHeader
        customer={customer}
        role={role}
        busy={busy}
        onReveal={() => setRevealOpen(true)}
        onDisable={() => setDisableOpen(true)}
        onEnable={() => void enable()}
      />
      <div className="admin-customer-layout">
        <section className="admin-section" aria-labelledby="addresses-heading">
          <h2 id="addresses-heading" className="admin-section-title">
            Addresses
          </h2>
          <AdminAddressList addresses={customer.addresses} />
        </section>
        <section className="admin-section" aria-labelledby="orders-heading">
          <h2 id="orders-heading" className="admin-section-title">
            Orders
          </h2>
          <EmptyState
            title="Orders arrive with P12"
            description="Order history and returns will appear here."
          />
        </section>
        <section className="admin-section" aria-labelledby="sessions-heading">
          <h2 id="sessions-heading" className="admin-section-title">
            Sessions
          </h2>
          <SessionsTable customerId={customer.id} rows={sessions} role={role} />
        </section>
        <section className="admin-section" aria-labelledby="dpdp-heading">
          <h2 id="dpdp-heading" className="admin-section-title">
            Data protection
          </h2>
          <DpdpActions
            customer={customer}
            role={role}
            onErased={() => {
              setCustomer((current) => ({
                ...current,
                deleted: true,
                isDisabled: true,
                maskedPhone: null,
                addresses: [],
                flags: { ...current.flags, deleted: true },
              }));
              router.refresh();
            }}
          />
        </section>
      </div>
      <RevealDialog customer={customer} open={revealOpen} onClose={() => setRevealOpen(false)} />
      <DisableDialog
        customer={customer}
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        onDisabled={(updated) => {
          setDisableOpen(false);
          setCustomer(updated);
          notify('Account disabled and signed out everywhere', 'success');
          router.refresh();
        }}
      />
    </>
  );
}
