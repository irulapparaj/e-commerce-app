import type { ReactNode } from 'react';

interface GallerySectionProps {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}

export function GallerySection({ id, title, children }: GallerySectionProps) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="flex flex-col gap-4 border-t border-hairline py-8"
      data-testid={`gallery-${id}`}
    >
      <h2 id={`${id}-heading`} className="small-caps font-body text-small text-muted">
        {title}
      </h2>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </section>
  );
}

interface SpecimenProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly wide?: boolean;
}

/** One state of one component, captioned. */
export function Specimen({ label, children, wide = false }: SpecimenProps) {
  return (
    <div className={wide ? 'flex w-full flex-col gap-2' : 'flex flex-col gap-2'}>
      {children}
      <span className="text-caption text-subtle">{label}</span>
    </div>
  );
}
