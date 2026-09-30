import { useTranslations } from 'next-intl';

import { Icon } from '@/components/ui/Icon';
import { Container } from '@/components/ui/Primitives';

/** Message keys under `home.testimonials.items`; ops rotate the quotes there, not here. */
const TESTIMONIAL_KEYS = ['first', 'second', 'third'] as const;
const MAX_STARS = 5;

/** Ratings arrive as message strings; anything unparseable renders as zero filled stars. */
export const clampRating = (raw: string): number => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(MAX_STARS, Math.max(0, Math.round(parsed)));
};

interface StarsProps {
  readonly rating: number;
  readonly label: string;
}

function Stars({ rating, label }: StarsProps) {
  return (
    <span role="img" aria-label={label} className="flex gap-0.5">
      {Array.from({ length: MAX_STARS }, (_, index) => (
        <Icon
          key={index}
          name="star"
          size={16}
          className={index < rating ? 'text-warning' : 'text-hairline'}
        />
      ))}
    </span>
  );
}

/**
 * Three curated quotes with name, city and rating (design plan P1.3). Copy lives in
 * `messages/en.json` as template content until real reviews replace it; the layout never
 * shows more or fewer than the three keyed items.
 */
export function Testimonials() {
  const t = useTranslations('home.testimonials');

  return (
    <section aria-labelledby="testimonials-heading" className="py-section" data-testid="testimonials">
      <Container>
        <p className="text-caption uppercase tracking-caps text-muted">{t('eyebrow')}</p>
        <h2 id="testimonials-heading" className="mt-3 font-display text-h2">
          {t('heading')}
        </h2>
        <ul className="mt-8 grid gap-4 md:grid-cols-3 md:gap-6">
          {TESTIMONIAL_KEYS.map((key) => {
            const rating = clampRating(t(`items.${key}.rating`));
            return (
              <li
                key={key}
                className="flex flex-col gap-3 rounded-image border border-hairline bg-surface p-6"
              >
                <Stars rating={rating} label={t('ratedLabel', { rating })} />
                <blockquote className="text-base text-text">
                  &ldquo;{t(`items.${key}.quote`)}&rdquo;
                </blockquote>
                <p className="mt-auto text-caption text-muted">
                  <span className="font-semibold text-text">{t(`items.${key}.name`)}</span>
                  {' · '}
                  {t(`items.${key}.city`)}
                  {' · '}
                  <span className="font-medium text-success">{t('verified')}</span>
                </p>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
