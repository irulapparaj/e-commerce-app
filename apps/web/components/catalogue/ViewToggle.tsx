'use client';

import { useTranslations } from 'next-intl';

import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';

interface ViewToggleProps {
  readonly value: 'grid' | 'list';
  readonly onChange: (value: 'grid' | 'list') => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  const t = useTranslations('catalogue');

  return (
    <div role="group" className="inline-flex rounded-control border border-hairline overflow-hidden">
      <button
        type="button"
        aria-label={t('gridView')}
        aria-pressed={value === 'grid'}
        onClick={() => onChange('grid')}
        className={cx(
          'inline-flex size-9 items-center justify-center transition-colors duration-fast ease-out',
          value === 'grid' ? 'bg-surface text-text' : 'bg-transparent text-muted hover:bg-surface hover:text-text',
        )}
      >
        <Icon name="grid" size={16} />
      </button>
      <button
        type="button"
        aria-label={t('listView')}
        aria-pressed={value === 'list'}
        onClick={() => onChange('list')}
        className={cx(
          'inline-flex size-9 items-center justify-center border-l border-hairline transition-colors duration-fast ease-out',
          value === 'list' ? 'bg-surface text-text' : 'bg-transparent text-muted hover:bg-surface hover:text-text',
        )}
      >
        <Icon name="list" size={16} />
      </button>
    </div>
  );
}
