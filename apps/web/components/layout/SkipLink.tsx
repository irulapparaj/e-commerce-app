import { useTranslations } from 'next-intl';

export const MAIN_CONTENT_ID = 'main';

/** First focusable element on every page; visible only while focused. */
export function SkipLink() {
  const t = useTranslations('shell');
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-toast focus:rounded-control focus:border focus:border-hairline focus:bg-surface focus:px-4 focus:py-3 focus:text-base focus:font-medium focus:text-text"
    >
      {t('skipToContent')}
    </a>
  );
}
