import { brand } from '@pe/shared';
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

export interface LayoutProps {
  readonly preview: string;
  readonly children: React.ReactNode;
}

const styles = {
  body: {
    backgroundColor: '#f6f6f6',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    margin: '0',
    padding: '0',
  },
  container: {
    backgroundColor: '#ffffff',
    margin: '32px auto',
    maxWidth: '560px',
    padding: '0',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  header: {
    backgroundColor: '#1a1a1a',
    padding: '24px 32px',
  },
  brandName: {
    color: '#ffffff',
    fontSize: '20px',
    fontWeight: '700',
    margin: '0',
    letterSpacing: '-0.5px',
  },
  tagline: {
    color: '#999999',
    fontSize: '12px',
    margin: '4px 0 0 0',
  },
  content: {
    padding: '32px',
  },
  footer: {
    padding: '24px 32px',
    backgroundColor: '#f9f9f9',
    borderTop: '1px solid #eeeeee',
  },
  footerText: {
    color: '#999999',
    fontSize: '11px',
    lineHeight: '1.5',
    margin: '0',
  },
  hr: {
    borderColor: '#eeeeee',
    margin: '0',
  },
} as const;

export const Layout = ({ preview, children }: LayoutProps): React.ReactElement => (
  <Html lang="en">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={styles.body}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.brandName}>{brand.name}</Text>
          <Text style={styles.tagline}>{brand.tagline}</Text>
        </Section>
        <Section style={styles.content}>{children}</Section>
        <Hr style={styles.hr} />
        <Section style={styles.footer}>
          <Text style={styles.footerText}>
            You are receiving this email because you have an account with {brand.name}.
          </Text>
          <Text style={styles.footerText}>
            {brand.name} · India
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);
