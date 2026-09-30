import { useTranslations } from 'next-intl';

import { Container, Section } from '@/components/ui/Primitives';
import { Skeleton } from '@/components/ui/Skeleton';

const TILE_COUNT = 4;

/** Skeleton of the home composition while a route streams in. */
export default function Loading() {
  const t = useTranslations('a11y');
  return (
    <Container>
      <Section>
        <div role="status" aria-label={t('loading')} className="flex flex-col gap-8">
          <div className="flex max-w-3xl flex-col gap-4">
            <Skeleton variant="text" width="quarter" />
            <Skeleton variant="heading" width="three-quarters" />
            <Skeleton variant="text" lines={2} />
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
            {Array.from({ length: TILE_COUNT }, (_, index) => (
              <div key={index} className="flex flex-col gap-3">
                <Skeleton variant="image" />
                <Skeleton variant="text" width="three-quarters" />
                <Skeleton variant="text" width="third" />
              </div>
            ))}
          </div>
        </div>
      </Section>
    </Container>
  );
}
