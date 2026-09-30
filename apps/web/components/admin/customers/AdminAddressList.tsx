import type { CustomerAddressDto } from '@/lib/admin/customer-types';

import { EmptyState } from '../EmptyState';

interface AdminAddressListProps {
  readonly addresses: readonly CustomerAddressDto[];
}

/** Address lines and phone arrive masked; city, state and pincode are clear (P08 task 3). */
export function AdminAddressList({ addresses }: AdminAddressListProps) {
  if (addresses.length === 0)
    return (
      <EmptyState
        title="No saved addresses"
        description="Addresses appear once the customer saves one at checkout."
      />
    );
  return (
    <ul className="admin-address-list" aria-label="Saved addresses">
      {addresses.map((address) => (
        <li key={address.id} className="admin-address-card" data-testid="address-row">
          <strong>
            {address.maskedName}
            {address.isDefault && (
              <span className="admin-badge admin-address-default" data-testid="address-default">
                Default
              </span>
            )}
          </strong>
          <span className="admin-tabular">{address.maskedLine1}</span>
          {address.maskedLine2 !== null && (
            <span className="admin-tabular">{address.maskedLine2}</span>
          )}
          <span>
            {address.city}, {address.state} {address.pincode}
          </span>
          <span className="admin-tabular">{address.maskedPhone}</span>
        </li>
      ))}
    </ul>
  );
}
