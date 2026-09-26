import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';

export const metadata: Metadata = { title: 'Checkout' };

interface CheckoutPageProps {
  readonly params: Promise<{ locale: string }>;
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="page" aria-labelledby="checkout-heading">
      <h1 id="checkout-heading">Checkout</h1>
      <p className="muted" style={{ marginTop: 'var(--space-1)' }}>
        Checkout arrives with plan P12. This page exists so the login gate can be exercised end to
        end.
      </p>
    </main>
  );
}
