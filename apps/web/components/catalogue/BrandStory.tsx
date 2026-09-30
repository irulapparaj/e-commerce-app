import { useTranslations } from 'next-intl';

import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/ui/Primitives';
import type { PublicSettings } from '@/lib/api/types';

interface BrandStoryProps {
  readonly settings: PublicSettings;
}

/** The tagline as a display line, one paragraph of why, and the way to the About page. */
export function BrandStory({ settings }: BrandStoryProps) {
  const t = useTranslations('home.story');
  const tagline = settings.brand.tagline.trim();

  return (
    <section
      aria-labelledby="story-heading"
      className="border-y border-hairline bg-surface py-section"
      data-testid="brand-story"
    >
      <Container>
        <div className="grid gap-8 md:grid-cols-12 md:items-end md:gap-6">
          <div className="md:col-span-7">
            <p className="text-caption uppercase tracking-caps text-muted">{t('eyebrow')}</p>
            <h2 id="story-heading" className="mt-3 max-w-xl font-display text-h1">
              {tagline === '' ? t('fallbackHeading') : tagline}
            </h2>
          </div>
          <div className="flex flex-col gap-5 md:col-span-5">
            <p className="text-base text-muted">{t('body')}</p>
            <div>
              <ButtonLink href="/pages/about-us" variant="secondary" icon="arrow">
                {t('cta')}
              </ButtonLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
