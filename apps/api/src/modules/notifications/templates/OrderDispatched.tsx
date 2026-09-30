import { brand } from '@pe/shared';
import { Link, Text } from '@react-email/components';

import { Layout } from './Layout';

export interface OrderDispatchedData {
  readonly orderNumber: string;
  readonly trackingNumber?: string;
  readonly trackingUrl?: string;
  readonly carrier?: string;
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
  trackingBox: {
    backgroundColor: '#f4f4f4',
    borderRadius: '6px',
    padding: '16px',
    margin: '0 0 16px 0',
  },
  trackingLabel: {
    color: '#999999',
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    margin: '0 0 4px 0',
  },
  trackingNumber: {
    color: '#1a1a1a',
    fontSize: '16px',
    fontWeight: '600',
    margin: '0',
  },
  note: {
    color: '#888888',
    fontSize: '13px',
    margin: '0',
  },
} as const;

export const OrderDispatched = ({
  orderNumber,
  trackingNumber,
  trackingUrl,
  carrier,
}: OrderDispatchedData): React.ReactElement => (
  <Layout preview={`Order ${orderNumber} has been dispatched — ${brand.name}`}>
    <Text style={styles.heading}>Order dispatched</Text>
    <Text style={styles.subheading}>Order #{orderNumber}</Text>
    <Text style={styles.body}>
      Great news! Your {brand.name} order has been dispatched and is on its way to you.
    </Text>
    {trackingNumber !== undefined && (
      <div style={styles.trackingBox}>
        <Text style={styles.trackingLabel}>{carrier ?? 'Carrier'} tracking</Text>
        {trackingUrl !== undefined ? (
          <Link href={trackingUrl} style={styles.trackingNumber}>
            {trackingNumber}
          </Link>
        ) : (
          <Text style={styles.trackingNumber}>{trackingNumber}</Text>
        )}
      </div>
    )}
    <Text style={styles.note}>
      Delivery usually takes 3–7 business days depending on your location.
    </Text>
  </Layout>
);

export default OrderDispatched;
