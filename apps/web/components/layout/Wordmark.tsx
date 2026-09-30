import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { Link as IntlLink } from '@/i18n/navigation';

interface WordmarkProps {
  readonly name: string;
}

export function Wordmark({ name }: WordmarkProps) {
  const t = useTranslations('shell');
  return (
    <IntlLink
      href="/"
      aria-label={t('brandHome', { brand: name })}
      className="wordmark inline-flex min-h-touch shrink items-center gap-2.5 text-text no-underline"
      data-testid="wordmark"
    >
      <Image
        src="/invita-logo.png"
        alt={name}
        width={40}
        height={40}
        className="h-10 w-10 object-contain"
        priority
      />
      {name}
    </IntlLink>
  );
}
