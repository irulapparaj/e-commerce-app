import { brand } from '@pe/shared';
import { Section, Text } from '@react-email/components';

import { Layout } from './Layout';

export interface OtpData {
  readonly code: string;
  readonly expiresMinutes: number;
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
    margin: '0 0 24px 0',
  },
  codeBox: {
    backgroundColor: '#f4f4f4',
    borderRadius: '6px',
    padding: '20px',
    textAlign: 'center' as const,
    margin: '0 0 24px 0',
  },
  code: {
    color: '#1a1a1a',
    fontSize: '36px',
    fontWeight: '700',
    letterSpacing: '0.3em',
    margin: '0',
    fontVariantNumeric: 'tabular-nums',
  },
  note: {
    color: '#888888',
    fontSize: '13px',
    margin: '0',
  },
} as const;

export const Otp = ({ code, expiresMinutes }: OtpData): React.ReactElement => (
  <Layout preview={`Your ${brand.name} sign-in code`}>
    <Text style={styles.heading}>Your sign-in code</Text>
    <Text style={styles.body}>
      Use the code below to sign in to your {brand.name} account. It expires in {expiresMinutes}{' '}
      minutes.
    </Text>
    <Section style={styles.codeBox}>
      <Text style={styles.code}>{code}</Text>
    </Section>
    <Text style={styles.note}>
      If you did not request this code, you can safely ignore this email.
    </Text>
  </Layout>
);

export default Otp;
