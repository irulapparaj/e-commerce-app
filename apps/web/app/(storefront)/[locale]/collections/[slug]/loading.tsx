import { Container, Section } from '@/components/ui/Primitives';
import { Skeleton } from '@/components/ui/Skeleton';

export default function CollectionLoading() {
  return (
    <Container>
      <Section>
        <Skeleton variant="text" width="third" />
        <div className="mt-1">
          <Skeleton variant="heading" width="three-quarters" />
        </div>
        <div className="mt-1 mb-6">
          <Skeleton variant="text" width="quarter" />
        </div>
        <div className="mb-6 h-10 w-full rounded-control bg-surface" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton variant="image" />
              <Skeleton variant="text" width="three-quarters" />
              <Skeleton variant="text" width="half" />
            </div>
          ))}
        </div>
      </Section>
    </Container>
  );
}
