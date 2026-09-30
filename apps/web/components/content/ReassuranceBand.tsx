import { useTranslations } from 'next-intl';

import { Container } from '@/components/ui/Primitives';

/** Message keys under `home.assure.items`; the band always shows exactly these three. */
const ASSURE_KEYS = ['pure', 'fresh', 'chosen'] as const;

/**
 * The category's answer to "is this the real thing?" (design plan P1.4): three concrete
 * purity facts on the dark hero ground so the band reads as a deliberate pause between
 * the product grid and the story. Copy lives in `messages/en.json`.
 */
export function ReassuranceBand() {
  const t = useTranslations('home.assure');

  return (
    <section
      aria-labelledby="assure-heading"
      className="bg-hero py-section"
      data-testid="reassurance-band"
    >
      <Container>
        {/* Hero tokens only: skins remap --accent freely and its contrast on --hero-bg is not guaranteed. */}
        <h2
          id="assure-heading"
          className="text-caption font-semibold uppercase tracking-caps text-hero-text"
        >
          {t('heading')}
        </h2>
        <ul className="mt-8 grid gap-8 md:grid-cols-3 md:gap-6">
          {ASSURE_KEYS.map((key) => (
            <li key={key} className="flex flex-col gap-2">
              <span aria-hidden="true" className="text-h3 leading-none text-accent">
                ✦
              </span>
              <h3 className="font-display text-h3 text-hero-text">{t(`items.${key}.title`)}</h3>
              <p className="text-small text-hero-muted">{t(`items.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
