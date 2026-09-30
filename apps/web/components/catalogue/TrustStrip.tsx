import { useTranslations } from 'next-intl';

import { Icon } from '@/components/ui/Icon';
import { Container } from '@/components/ui/Primitives';
import type { PublicSettings } from '@/lib/api/types';
import { formatWholeRupees } from '@/lib/format';

interface TrustStripProps {
  readonly settings: PublicSettings;
}

/**
 * The four reasons to buy on one compact line — a checkmark and a short fact each, read straight
 * from settings so the copy can never drift from policy: free-shipping threshold, return window,
 * payment provider and the dispatch city. Detail lives in DeliveryNotes on the PDP, not here.
 */
export function TrustStrip({ settings }: TrustStripProps) {
  const t = useTranslations('home.trust');
  const threshold = settings.freeShippingThreshold;

  const items: readonly string[] = [
    threshold > 0 ? t('shipping', { amount: formatWholeRupees(threshold) }) : t('shippingAll'),
    t('returns', { days: settings.returnWindowDays }),
    t('payments'),
    t('dispatch', { city: settings.pickupLocation.city }),
  ];

  return (
    <section
      aria-label={t('label')}
      className="border-b border-hairline bg-surface"
      data-testid="trust-strip"
    >
      <Container>
        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 py-4">
          {items.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <Icon name="check" size={20} className="shrink-0 text-success" />
              <p className="text-base font-semibold text-text">{item}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
