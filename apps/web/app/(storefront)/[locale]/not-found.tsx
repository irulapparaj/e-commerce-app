import { getTranslations } from 'next-intl/server';

import { ButtonLink } from '@/components/ui/Button';
import { Container, Section } from '@/components/ui/Primitives';

export default async function NotFound() {
  const t = await getTranslations('errors.notFound');
  return (
    <Container size="narrow">
      <Section aria-labelledby="not-found-heading">
        <div className="flex flex-col items-start gap-4">
          <h1 id="not-found-heading">{t('title')}</h1>
          <p className="text-base text-muted">{t('body')}</p>
          <ButtonLink href="/" variant="secondary" icon="arrow">
            {t('home')}
          </ButtonLink>
        </div>
      </Section>
    </Container>
  );
}
