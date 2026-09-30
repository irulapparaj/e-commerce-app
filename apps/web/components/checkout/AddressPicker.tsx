'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import type { AddressDto } from '@/lib/api/types';

import { AddressForm } from './AddressForm';

interface AddressPickerProps {
  readonly addresses: readonly AddressDto[];
  readonly selected: string | null;
  readonly onSelect: (id: string) => void;
  readonly onAdd: (address: AddressDto) => void;
}

export function AddressPicker({ addresses, selected, onSelect, onAdd }: AddressPickerProps) {
  const [showForm, setShowForm] = useState(addresses.length === 0);

  const handleSave = (address: AddressDto) => {
    onAdd(address);
    onSelect(address.id);
    setShowForm(false);
  };

  return (
    <div className="space-y-3">
      {addresses.map((addr) => (
        <label
          key={addr.id}
          data-testid="saved-address"
          className={cx(
            'flex cursor-pointer items-start gap-3 rounded-card border p-4 transition-colors',
            selected === addr.id
              ? 'border-accent bg-surface'
              : 'border-hairline hover:border-accent/50',
          )}
        >
          <input
            type="radio"
            name="address"
            value={addr.id}
            checked={selected === addr.id}
            onChange={() => onSelect(addr.id)}
            className="mt-0.5 accent-accent"
          />
          <div className="min-w-0 text-base">
            <p className="font-medium">{addr.name}</p>
            <p className="text-muted">{addr.line1}{addr.line2 !== null ? `, ${addr.line2}` : ''}</p>
            <p className="text-muted">{addr.city}, {addr.state} — {addr.pincode}</p>
            <p className="text-muted">{addr.phone}</p>
          </div>
        </label>
      ))}

      {showForm ? (
        <div className="rounded-card border border-hairline p-4">
          <p className="mb-4 font-medium">New address</p>
          <AddressForm
            onSave={handleSave}
            {...(addresses.length > 0 ? { onCancel: () => setShowForm(false) } : {})}
          />
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setShowForm(true)} icon="plus" data-testid="add-address">
          Add new address
        </Button>
      )}
    </div>
  );
}
