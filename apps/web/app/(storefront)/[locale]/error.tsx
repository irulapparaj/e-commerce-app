'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { Button } from '@/components/ui/Button';
import { Container, Section } from '@/components/ui/Primitives';

interface ErrorPageProps {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}

/** Never shows the message or stack; the digest is enough to find it in the server logs. */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const t = useTranslations('errors.generic');

  useEffect(() => {
    console.error('storefront render failed', { digest: error.digest });
  }, [error]);

  return (
    <Container size="narrow">
      <Section aria-labelledby="error-heading">
        <div className="flex flex-col items-start gap-4">
          <h1 id="error-heading">{t('title')}</h1>
          <p className="text-base text-muted">{t('body')}</p>
          <Button variant="secondary" onClick={reset}>
            {t('retry')}
          </Button>
        </div>
      </Section>
    </Container>
  );
}
