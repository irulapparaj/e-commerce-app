import { useTranslations } from 'next-intl';

interface TrackingLinkProps {
  readonly url: string | null;
  readonly awb: string | null;
}

export function TrackingLink({ url, awb }: TrackingLinkProps) {
  const t = useTranslations('account');

  if (url === null || awb === null) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="btn btn-secondary"
      style={{ fontSize: 'var(--text-small)', display: 'inline-flex' }}
      data-testid="order-track-link"
    >
      {t('trackPackage')} ↗
    </a>
  );
}
