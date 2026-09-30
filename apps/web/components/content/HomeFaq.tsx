import { useTranslations } from 'next-intl';

import { Link } from '@/components/ui/Link';
import { Container } from '@/components/ui/Primitives';
import { FAQ_ITEMS } from '@/lib/content/faq';

import { Faq } from './Faq';

/** The home page answers the late-funnel doubts only; the full list stays on /pages/faq. */
const HOME_FAQ_COUNT = 5;

/**
 * Five questions from the canonical FAQ content ahead of the footer (design plan P3.2),
 * with the way to the full FAQ page underneath.
 */
export function HomeFaq() {
  const t = useTranslations('home.faq');

  return (
    <section aria-labelledby="home-faq-heading" className="py-section" data-testid="home-faq">
      <Container size="narrow">
        <p className="text-caption uppercase tracking-caps text-muted">{t('eyebrow')}</p>
        <h2 id="home-faq-heading" className="mt-3 font-display text-h2">
          {t('heading')}
        </h2>
        <div className="mt-6">
          <Faq items={FAQ_ITEMS.slice(0, HOME_FAQ_COUNT)} />
        </div>
        <div className="mt-6">
          <Link href="/pages/faq" variant="quiet">
            {t('cta')}
          </Link>
        </div>
      </Container>
    </section>
  );
}
