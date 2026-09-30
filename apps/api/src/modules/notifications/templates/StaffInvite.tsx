import { brand } from '@pe/shared';
import { Link, Text } from '@react-email/components';

import { Layout } from './Layout';

export interface StaffInviteData {
  readonly name: string;
  readonly loginUrl: string;
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

export const StaffInvite = ({ name, loginUrl }: StaffInviteData): React.ReactElement => (
  <Layout preview={`You have been invited to the ${brand.name} admin console`}>
    <Text style={styles.heading}>Admin console invitation</Text>
    <Text style={styles.body}>Hello {name},</Text>
    <Text style={styles.body}>
      You have been given access to the {brand.name} admin console. Sign in with this email address
      at <Link href={loginUrl}>{loginUrl}</Link>.
    </Text>
    <Text style={styles.body}>
      You will be asked to set up an authenticator app on first login.
    </Text>
    <Text style={styles.note}>
      If you did not expect this invitation, please contact the store owner.
    </Text>
  </Layout>
);

export default StaffInvite;
