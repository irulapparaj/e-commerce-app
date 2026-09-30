import { Container, Section } from '@/components/ui/Primitives';
import { Skeleton } from '@/components/ui/Skeleton';

export default function ProductLoading() {
  return (
    <Container>
      <Section>
        <Skeleton variant="text" width="three-quarters" />
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Skeleton variant="block" />
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="block" />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <Skeleton variant="heading" width="three-quarters" />
            <Skeleton variant="text" width="third" />
            <Skeleton variant="text" width="quarter" />
            <div className="flex gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} variant="block" width="quarter" />
              ))}
            </div>
            <Skeleton variant="block" />
            <Skeleton variant="block" />
          </div>
        </div>
      </Section>
    </Container>
  );
}
