import type { OrderAddressDto } from '@/lib/admin/order-types';

interface OrderAddressProps {
  readonly address: OrderAddressDto;
}

export function OrderAddress({ address }: OrderAddressProps) {
  return (
    <section aria-labelledby="order-address-heading">
      <h2 id="order-address-heading" className="admin-section-heading">
        Shipping Address
      </h2>
      <address className="admin-address" data-testid="order-address">
        <span className="font-medium" data-testid="order-address-name">
          {address.name}
        </span>
        <br />
        {address.line1}
        {address.line2 !== null && address.line2 !== '' && (
          <>
            <br />
            {address.line2}
          </>
        )}
        <br />
        {address.city}, {address.state} – {address.pincode}
        <br />
        <span className="admin-muted" data-testid="order-address-phone">
          {address.maskedPhone}
        </span>
      </address>
    </section>
  );
}
