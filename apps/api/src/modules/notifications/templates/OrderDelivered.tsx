import { brand } from '@pe/shared';
import { Text } from '@react-email/components';

import { Layout } from './Layout';

export interface OrderDeliveredData {
  readonly orderNumber: string;
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
    margin: '0',
  },
} as const;

export const OrderDelivered = ({ orderNumber }: OrderDeliveredData): React.ReactElement => (
  <Layout preview={`Order ${orderNumber} has been delivered — ${brand.name}`}>
    <Text style={styles.heading}>Order delivered</Text>
    <Text style={styles.subheading}>Order #{orderNumber}</Text>
    <Text style={styles.body}>
      Your {brand.name} order has been delivered. We hope you enjoy your purchase!
    </Text>
    <Text style={styles.note}>
      If you have any issues with your order, please contact our support team.
    </Text>
  </Layout>
);

export default OrderDelivered;
