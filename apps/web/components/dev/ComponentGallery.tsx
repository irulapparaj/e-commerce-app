'use client';

import { Container } from '@/components/ui/Primitives';
import type { Theme } from '@/lib/theme';

import { GalleryButtons, GalleryCommerce, GalleryFields } from './GalleryControls';
import { GalleryNavigation } from './GalleryNavigation';
import { GalleryOverlays } from './GalleryOverlays';

const THEMES: readonly Theme[] = ['light', 'dark'];

function ThemePanel({ theme }: { readonly theme: Theme }) {
  return (
    <div data-theme={theme} className="bg-bg text-text" data-testid={`gallery-${theme}`}>
      <Container>
        <div className="flex flex-col py-8">
          <h1 className="text-h2">Components · {theme}</h1>
          <GalleryButtons />
          <GalleryFields />
          <GalleryCommerce />
          <GalleryOverlays />
          <GalleryNavigation />
        </div>
      </Container>
    </div>
  );
}

/** `/dev/components`: both themes stacked so one screenshot covers the whole system. */
export function ComponentGallery() {
  return (
    <div className="flex flex-col">
      {THEMES.map((theme) => (
        <ThemePanel key={theme} theme={theme} />
      ))}
    </div>
  );
}
