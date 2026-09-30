/**
 * Development-only email preview page.
 * Iframes the API preview endpoint to render the template HTML.
 * Only accessible in development mode (Next.js strips this in production builds
 * when wrapped with the NODE_ENV check in layout or middleware).
 */

import { notFound } from 'next/navigation';

import { getWebEnv } from '@/lib/env';

const VALID_TEMPLATES = [
  'otp',
  'staff-invite',
  'mfa-reenrol',
  'order-confirmation',
  'order-cancelled',
  'order-dispatched',
  'order-delivered',
  'data-export-ready',
  'account-deleted',
] as const;

type ValidTemplate = (typeof VALID_TEMPLATES)[number];

const isValidTemplate = (value: string): value is ValidTemplate =>
  (VALID_TEMPLATES as readonly string[]).includes(value);

interface Props {
  readonly params: Promise<{ locale: string; template: string }>;
}

export default async function EmailPreviewPage({ params }: Props) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const { template } = await params;

  if (!isValidTemplate(template)) {
    notFound();
  }

  const apiUrl = getWebEnv().API_INTERNAL_URL;
  const previewUrl = `${apiUrl}/dev/emails/${template}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', margin: 0 }}>
      <div
        style={{
          padding: '8px 16px',
          backgroundColor: '#1a1a1a',
          color: '#fff',
          fontFamily: 'monospace',
          fontSize: '13px',
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
        }}
      >
        <strong>Email Preview</strong>
        <span style={{ color: '#999' }}>template: {template}</span>
        <a href={previewUrl} target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>
          Open in new tab
        </a>
      </div>
      <nav
        style={{
          padding: '8px 16px',
          backgroundColor: '#f4f4f4',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          fontSize: '12px',
        }}
      >
        {VALID_TEMPLATES.map((t) => (
          <a
            key={t}
            href={`/en/dev/emails/${t}`}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              backgroundColor: t === template ? '#1a1a1a' : '#e0e0e0',
              color: t === template ? '#fff' : '#444',
              textDecoration: 'none',
            }}
          >
            {t}
          </a>
        ))}
      </nav>
      <iframe
        src={previewUrl}
        style={{ flex: 1, border: 'none', width: '100%' }}
        title={`Email preview: ${template}`}
      />
    </div>
  );
}

export function generateStaticParams() {
  // Only generate static params in development
  if (process.env.NODE_ENV === 'production') return [];
  return VALID_TEMPLATES.map((template) => ({ template }));
}
