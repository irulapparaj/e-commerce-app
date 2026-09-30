import { brand } from '@pe/shared';
import { Text } from '@react-email/components';

import { Layout } from './Layout';

export interface OrderCancelledData {
  readonly orderNumber: string;
  readonly note: string | null;
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
  body: {
    color: '#444444',
    fontSize: '15px',
    lineHeight: '1.6',
    margin: '0 0 16px 0',
  },
  note: {
    color: '#888888',
    fontSize: '13px',
    lineHeight: '1.6',
    margin: '0',
  },
} as const;

export const OrderCancelled = ({ orderNumber, note }: OrderCancelledData): React.ReactElement => (
  <Layout preview={`Order ${orderNumber} has been cancelled — ${brand.name}`}>
    <Text style={styles.heading}>Order cancelled</Text>
    <Text style={styles.subheading}>Order #{orderNumber}</Text>
    <Text style={styles.body}>
      Your order has been cancelled. If you paid for this order, a refund will be processed within
      5–7 business days.
    </Text>
    {note !== null && note !== '' && (
      <Text style={styles.note}>Note from the store: {note}</Text>
    )}
    <Text style={styles.note}>
      If you have questions, please contact our support team.
    </Text>
  </Layout>
);

export default OrderCancelled;
