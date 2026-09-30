'use client';

import { useLocale } from 'next-intl';
import { useEffect, useState } from 'react';

import { getAddresses, checkServiceability  } from '@/lib/api/checkout';
import type { AddressDto, CreateOrderResult, ServiceabilityDto } from '@/lib/api/types';
import { useCartStore } from '@/stores/cart';

import { AddressPicker } from './AddressPicker';
import { CheckoutSteps, type CheckoutStep } from './CheckoutSteps';
import { ContactCard } from './ContactCard';
import { CouponField } from './CouponField';
import { OrderSummary } from './OrderSummary';
import { PayButton } from './PayButton';
import { RazorpayLoader } from './RazorpayLoader';
import { ShippingMethod } from './ShippingMethod';

interface CheckoutPageProps {
  readonly email: string;
  readonly phone: string;
}

export function CheckoutPage({ email: initialEmail, phone: initialPhone }: CheckoutPageProps) {
  const locale = useLocale();
  const cart = useCartStore((s) => s.cart);
  const hydrate = useCartStore((s) => s.hydrate);

  const [step, setStep] = useState<CheckoutStep>('contact');
  const [addresses, setAddresses] = useState<readonly AddressDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [serviceability, setServiceability] = useState<ServiceabilityDto | null>(null);
  const [phone, setPhone] = useState(initialPhone);
  const [order, setOrder] = useState<CreateOrderResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      await Promise.all([
        hydrate(),
        getAddresses().then((r) => {
          setAddresses(r.data);
          const def = r.data.find((a) => a.isDefault);
          if (def !== undefined) setSelectedId(def.id);
        }).catch(() => {}),
      ]);
      setLoading(false);
    };
    void init();
  }, [hydrate]);

  useEffect(() => {
    if (selectedId === null) {
      setServiceability(null);
      return;
    }
    const addr = addresses.find((a) => a.id === selectedId);
    if (addr === undefined) return;
    checkServiceability(addr.pincode)
      .then((r) => setServiceability(r.data))
      .catch(() => setServiceability(null));
  }, [selectedId, addresses]);

  const selectedAddr = addresses.find((a) => a.id === selectedId);
  const isFreeShipping = cart.freeShipping.reached;
  const shippingRate = serviceability?.ratePaise ?? 4900;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="size-8 animate-spin rounded-full border-2 border-hairline border-t-accent" />
      </div>
    );
  }

  if (order !== null) {
    return (
      <RazorpayLoader
        order={order}
        email={initialEmail}
        phone={phone}
        locale={locale}
        onRetry={() => setOrder(null)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-screen-lg px-gutter py-section">
      <h1 className="mb-6 text-h1">Checkout</h1>
      <CheckoutSteps current={step} />

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section aria-labelledby="contact-heading">
            <h2 id="contact-heading" className="mb-3 text-h3">
              Contact
            </h2>
            <ContactCard
              email={initialEmail}
              phone={phone}
              onSave={(p) => { setPhone(p); setStep('address'); }}
            />
          </section>

          <section aria-labelledby="address-heading">
            <h2 id="address-heading" className="mb-3 text-h3">
              Delivery address
            </h2>
            <AddressPicker
              addresses={addresses}
              selected={selectedId}
              onSelect={(id) => { setSelectedId(id); setStep('shipping'); }}
              onAdd={(addr) => { setAddresses((prev) => [...prev, addr]); }}
            />
          </section>

          {selectedAddr !== undefined && (
            <section aria-labelledby="shipping-heading">
              <h2 id="shipping-heading" className="mb-3 text-h3">
                Shipping
              </h2>
              <ShippingMethod
                ratePaise={shippingRate}
                etaDays={serviceability?.etaDays ?? null}
                isFree={isFreeShipping}
              />
            </section>
          )}

          <section aria-labelledby="coupon-heading">
            <h2 id="coupon-heading" className="sr-only">Coupon</h2>
            <CouponField />
          </section>

          <PayButton
            addressId={selectedId ?? ''}
            disabled={selectedId === null || serviceability?.serviceable === false}
            onOrderCreated={(result) => { setStep('payment'); setOrder(result); }}
          />
        </div>

        <aside>
          <div className="rounded-card border border-hairline p-6">
            <h2 className="mb-4 text-h3">Order summary</h2>
            <OrderSummary
              cart={cart}
              shippingPaise={shippingRate}
              isFreeShipping={isFreeShipping}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
