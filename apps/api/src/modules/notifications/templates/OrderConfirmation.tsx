import { brand } from '@pe/shared';
import { Section, Text } from '@react-email/components';

import { Layout } from './Layout';

export interface OrderItem {
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: string;
}

export interface OrderAddress {
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly state: string;
  readonly pincode: string;
}

export interface OrderTotals {
  readonly subtotal: string;
  readonly shipping: string;
  readonly discount?: string;
  readonly total: string;
}

export interface OrderConfirmationData {
  readonly orderNumber: string;
  readonly items: readonly OrderItem[];
  readonly totals: OrderTotals;
  readonly address: OrderAddress;
}

const styles = {
  heading: {
    color: '#1a1a1a',
    fontSize: '20px',
    fontWeight: '600',
    margin: '0 0 8px 0',
  },
  subheading: {
    color: '#666666',
    fontSize: '14px',
    margin: '0 0 24px 0',
  },
  sectionLabel: {
    color: '#999999',
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    margin: '0 0 8px 0',
  },
  itemRow: {
    borderBottom: '1px solid #eeeeee',
    padding: '12px 0',
  },
  itemName: {
    color: '#1a1a1a',
    fontSize: '14px',
    margin: '0 0 2px 0',
  },
  itemMeta: {
    color: '#888888',
    fontSize: '13px',
    margin: '0',
  },
  totalRow: {
    padding: '4px 0',
  },
  totalLabel: {
    color: '#666666',
    fontSize: '14px',
    margin: '0',
  },
  totalValue: {
    color: '#1a1a1a',
    fontSize: '14px',
    margin: '0',
    textAlign: 'right' as const,
  },
  grandTotalLabel: {
    color: '#1a1a1a',
    fontSize: '15px',
    fontWeight: '600',
    margin: '0',
  },
  grandTotalValue: {
    color: '#1a1a1a',
    fontSize: '15px',
    fontWeight: '600',
    margin: '0',
    textAlign: 'right' as const,
  },
  addressText: {
    color: '#444444',
    fontSize: '14px',
    lineHeight: '1.6',
    margin: '0',
  },
} as const;

export const OrderConfirmation = ({
  orderNumber,
  items,
  totals,
  address,
}: OrderConfirmationData): React.ReactElement => (
  <Layout preview={`Order ${orderNumber} confirmed — ${brand.name}`}>
    <Text style={styles.heading}>Order confirmed</Text>
    <Text style={styles.subheading}>Order #{orderNumber}</Text>

    <Text style={styles.sectionLabel}>Items</Text>
    {items.map((item, index) => (
      <Section key={index} style={styles.itemRow}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemMeta}>
          Qty: {item.quantity} · {item.unitPrice} each
        </Text>
      </Section>
    ))}

    <Section style={{ padding: '16px 0 0 0' }}>
      <Text style={styles.sectionLabel}>Summary</Text>
      <Section style={styles.totalRow}>
        <Text style={styles.totalLabel}>Subtotal</Text>
        <Text style={styles.totalValue}>{totals.subtotal}</Text>
      </Section>
      <Section style={styles.totalRow}>
        <Text style={styles.totalLabel}>Shipping</Text>
        <Text style={styles.totalValue}>{totals.shipping}</Text>
      </Section>
      {totals.discount !== undefined && (
        <Section style={styles.totalRow}>
          <Text style={styles.totalLabel}>Discount</Text>
          <Text style={styles.totalValue}>{totals.discount}</Text>
        </Section>
      )}
      <Section style={{ ...styles.totalRow, borderTop: '1px solid #eeeeee', paddingTop: '12px' }}>
        <Text style={styles.grandTotalLabel}>Total</Text>
        <Text style={styles.grandTotalValue}>{totals.total}</Text>
      </Section>
    </Section>

    <Section style={{ padding: '16px 0 0 0' }}>
      <Text style={styles.sectionLabel}>Delivering to</Text>
      <Text style={styles.addressText}>
        {address.line1}
        {address.line2 !== undefined ? `, ${address.line2}` : ''}
        {'\n'}
        {address.city}, {address.state} {address.pincode}
      </Text>
    </Section>
  </Layout>
);

export default OrderConfirmation;
