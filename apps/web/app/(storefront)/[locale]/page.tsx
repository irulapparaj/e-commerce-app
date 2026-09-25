import { getTranslations, setRequestLocale } from 'next-intl/server';

interface HomePageProps {
  readonly params: Promise<{ locale: string }>;
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');

  return (
    <main className="page" aria-labelledby="home-heading">
      <p
        className="muted"
        style={{
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontSize: 'var(--text-small)',
        }}
      >
        {t('comingSoon')}
      </p>
      <h1 id="home-heading" style={{ marginTop: 'var(--space-2)' }}>
        {t('title')}
      </h1>
      <p style={{ maxWidth: '40ch', marginTop: 'var(--space-3)', fontSize: 'var(--text-h3)' }}>
        {t('tagline')}
      </p>
      <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
        {t('intro')}
      </p>
      <hr
        style={{
          border: 0,
          borderTop: '1px solid var(--hairline)',
          marginTop: 'var(--space-section)',
        }}
      />
    </main>
  );
}
