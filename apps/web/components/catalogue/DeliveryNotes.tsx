import { useTranslations } from 'next-intl';

import { Icon, type IconName } from '@/components/ui/Icon';
import type { PublicSettings } from '@/lib/api/types';
import { formatWholeRupees } from '@/lib/format';

interface DeliveryNotesProps {
  readonly settings: PublicSettings;
}

interface Note {
  readonly icon: IconName;
  readonly text: string;
}

/** Under the buy box: what happens after "Add to cart", read from settings so it matches policy. */
export function DeliveryNotes({ settings }: DeliveryNotesProps) {
  const t = useTranslations('catalogue.delivery');
  const threshold = settings.freeShippingThreshold;

  const notes: readonly Note[] = [
    {
      icon: 'truck',
      text:
        threshold > 0
          ? t('freeShipping', { amount: formatWholeRupees(threshold) })
          : t('shippingAll'),
    },
    { icon: 'pin', text: t('dispatch', { city: settings.pickupLocation.city }) },
    { icon: 'refresh', text: t('returns', { days: settings.returnWindowDays }) },
    { icon: 'shield', text: t('secure') },
  ];

  return (
    <section
      aria-labelledby="delivery-heading"
      className="border-t border-hairline pt-5"
      data-testid="delivery-notes"
    >
      <h2 id="delivery-heading" className="small-caps font-body text-small text-muted">
        {t('heading')}
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {notes.map((note) => (
          <li key={note.icon} className="flex items-start gap-3 text-small text-text">
            <Icon name={note.icon} size={20} className="mt-px text-muted" />
            <span>{note.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
