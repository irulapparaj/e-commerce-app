import { brand } from '@pe/shared';
import { Text } from '@react-email/components';

import { Layout } from './Layout';

export interface AccountDeletedData {
  readonly name: string;
}

const styles = {
  heading: {
    color: '#1a1a1a',
    fontSize: '20px',
    fontWeight: '600',
    margin: '0 0 16px 0',
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

export const AccountDeleted = ({ name }: AccountDeletedData): React.ReactElement => (
  <Layout preview={`Your ${brand.name} account has been deleted`}>
    <Text style={styles.heading}>Account deleted</Text>
    <Text style={styles.body}>Hello {name},</Text>
    <Text style={styles.body}>
      Your {brand.name} account has been permanently deleted as requested. All personal data
      associated with your account has been removed.
    </Text>
    <Text style={styles.note}>
      If you did not request this, please contact our support team immediately.
    </Text>
  </Layout>
);

export default AccountDeleted;
