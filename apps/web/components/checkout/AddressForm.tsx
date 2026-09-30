'use client';

import { STATE_CODES } from '@pe/shared';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { checkServiceability, createAddress, updateAddress } from '@/lib/api/checkout';
import { ApiError } from '@/lib/api/envelope';
import type { AddressCreateInput, AddressDto, ServiceabilityDto } from '@/lib/api/types';

interface AddressFormProps {
  readonly initial?: Partial<AddressDto>;
  readonly onSave: (address: AddressDto) => void;
  readonly onCancel?: () => void;
}

const EMPTY: AddressCreateInput = {
  name: '',
  phone: '',
  line1: '',
  line2: null,
  city: '',
  state: 'TN',
  pincode: '',
};

export function AddressForm({ initial, onSave, onCancel }: AddressFormProps) {
  const baseId = useId();
  const id = (key: string) => `${baseId}-${key}`;

  const [form, setForm] = useState<AddressCreateInput>({
    name: initial?.name ?? EMPTY.name,
    phone: initial?.phone ?? EMPTY.phone,
    line1: initial?.line1 ?? EMPTY.line1,
    line2: initial?.line2 ?? EMPTY.line2,
    city: initial?.city ?? EMPTY.city,
    state: initial?.state ?? EMPTY.state,
    pincode: initial?.pincode ?? EMPTY.pincode,
  });
  const [serviceability, setServiceability] = useState<ServiceabilityDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof AddressCreateInput>(key: K, value: AddressCreateInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const onPincodeBlur = async () => {
    if (form.pincode.length !== 6) return;
    try {
      const result = await checkServiceability(form.pincode);
      setServiceability(result.data);
    } catch {
      setServiceability(null);
    }
  };

  const validate = (): string | null => {
    if (form.name.trim() === '') return 'Full name is required';
    if (!/^[6-9]\d{9}$/.test(form.phone)) return 'Enter a valid 10-digit mobile number';
    if (form.line1.trim() === '') return 'Address line 1 is required';
    if (form.city.trim() === '') return 'City is required';
    if (!/^\d{6}$/.test(form.pincode)) return 'PIN code must be exactly 6 digits';
    return null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError !== null) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = initial?.id !== undefined
        ? await updateAddress(initial.id, form)
        : await createAddress(form);
      onSave(result.data);
    } catch (err) {
      if (err instanceof ApiError) {
        const details = err.details;
        const fieldErrors = Array.isArray(details)
          ? (details as { path: string; message: string }[])
              .map((d) => `${d.path || 'field'}: ${d.message}`)
              .join(', ')
          : err.message;
        setError(fieldErrors);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to save address');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate data-testid="address-form" aria-label="Shipping address">
      <Field label="Full name" required htmlFor={id('fullName')}>
        <Input
          id={id('fullName')}
          name="fullName"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          required
          maxLength={120}
          autoComplete="name"
        />
      </Field>

      <Field label="Mobile number" required htmlFor={id('phone')}>
        <Input
          id={id('phone')}
          name="phone"
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
          type="tel"
          required
          pattern="[6-9][0-9]{9}"
          autoComplete="tel"
        />
      </Field>

      <Field label="Address line 1" required htmlFor={id('line1')}>
        <Input
          id={id('line1')}
          name="line1"
          value={form.line1}
          onChange={(e) => set('line1', e.target.value)}
          required
          maxLength={120}
          autoComplete="address-line1"
        />
      </Field>

      <Field label="Address line 2" htmlFor={id('line2')}>
        <Input
          id={id('line2')}
          name="line2"
          value={form.line2 ?? ''}
          onChange={(e) => set('line2', e.target.value || null)}
          maxLength={120}
          autoComplete="address-line2"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" required htmlFor={id('city')}>
          <Input
            id={id('city')}
            name="city"
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
            required
            maxLength={80}
            autoComplete="address-level2"
          />
        </Field>

        <Field label="State" required htmlFor={id('state')}>
          <select
            id={id('state')}
            name="state"
            value={form.state}
            onChange={(e) => set('state', e.target.value)}
            className="w-full rounded-control border border-hairline bg-bg px-3 py-2 text-base text-text outline-none focus:border-accent"
            required
          >
            {(STATE_CODES as readonly string[]).map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="PIN code"
        required
        htmlFor={id('pincode')}
        {...(serviceability?.serviceable === true
          ? { help: `Delivery in ${serviceability.etaDays} days` }
          : {})}
        {...(serviceability?.serviceable === false
          ? { error: 'Delivery not available to this PIN code' }
          : {})}
      >
        <Input
          id={id('pincode')}
          name="pincode"
          value={form.pincode}
          onChange={(e) => set('pincode', e.target.value)}
          onBlur={onPincodeBlur}
          required
          pattern="\d{6}"
          maxLength={6}
          inputMode="numeric"
          autoComplete="postal-code"
        />
      </Field>

      {error !== null && (
        <p className="text-small text-error" role="alert">{error}</p>
      )}

      <div className="flex gap-3">
        <Button type="submit" loading={saving} disabled={saving} data-testid="address-submit">
          {initial?.id !== undefined ? 'Update address' : 'Save address'}
        </Button>
        {onCancel !== undefined && (
          <Button variant="ghost" type="button" onClick={onCancel} data-testid="address-cancel">
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
