import { brand } from '@pe/shared';
import { Link, Text } from '@react-email/components';

import { Layout } from './Layout';

export interface MfaReenrolData {
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
  alert: {
    color: '#c0392b',
    fontSize: '13px',
    margin: '0',
  },
} as const;

export const MfaReenrol = ({ name, loginUrl }: MfaReenrolData): React.ReactElement => (
  <Layout preview={`Your ${brand.name} admin authenticator was reset`}>
    <Text style={styles.heading}>Authenticator reset</Text>
    <Text style={styles.body}>Hello {name},</Text>
    <Text style={styles.body}>
      An administrator reset the authenticator app on your {brand.name} admin account and signed
      you out everywhere.
    </Text>
    <Text style={styles.body}>
      Sign in at <Link href={loginUrl}>{loginUrl}</Link> to set up a new authenticator.
    </Text>
    <Text style={styles.alert}>
      If you did not expect this, contact the store owner immediately.
    </Text>
  </Layout>
);

export default MfaReenrol;
