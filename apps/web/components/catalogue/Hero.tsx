import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { PublicSettings } from '@/lib/api/types';

import { CATEGORIES_SECTION_ID } from './CategoryGrid';

interface HeroProps {
  readonly settings: PublicSettings;
}

const HERO_IMAGE = '/hero.jpg';

/**
 * Full-bleed still, a translucent scrim and the copy in the lower corner (DESIGN.md §16). Skins tint
 * the scrim and the type through the `--hero-*` tokens; the composition itself never changes. The
 * heading carries the value proposition (the wordmark already says the brand); the tagline sits
 * above it as the eyebrow. One accent CTA plus a quiet in-page link for browsers.
 */
export function Hero({ settings }: HeroProps) {
  const t = useTranslations('home.hero');
  const eyebrow = settings.brand.tagline.trim();

  return (
    <section
      data-testid="hero"
      aria-labelledby="hero-heading"
      className="relative aspect-[21/9] max-h-[640px] min-h-[30rem] w-full overflow-hidden bg-hero"
    >
      <Image
        src={HERO_IMAGE}
        alt=""
        fill
        priority
        fetchPriority="high"
        sizes="100vw"
        className="object-cover"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-hero/85 via-hero/45 to-hero/10 md:bg-gradient-to-r md:from-hero/80 md:via-hero/35 md:to-transparent"
      />
      <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-8 md:p-12 lg:p-16">
        <div className="flex max-w-2xl flex-col gap-4 md:gap-5">
          {eyebrow !== '' && (
            <p className="text-caption uppercase tracking-caps text-hero-muted">{eyebrow}</p>
          )}
          <h1 id="hero-heading" className="font-display text-display text-hero-text">
            {t('title')}
          </h1>
          <p className="max-w-lg text-base text-hero-muted md:text-h3 md:leading-snug">
            {t('lede', { city: settings.pickupLocation.city })}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-6 gap-y-3">
            <ButtonLink href="/collections" variant="primary" icon="arrow" data-testid="hero-cta">
              {t('primaryCta')}
            </ButtonLink>
            <a
              href={`#${CATEGORIES_SECTION_ID}`}
              className="inline-flex min-h-touch items-center gap-1 text-base font-medium text-hero-text underline decoration-hero-muted underline-offset-4 transition-colors duration-fast ease-out hover:decoration-hero-text"
            >
              {t('secondaryCta')}
              <Icon name="chevron" size={16} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
