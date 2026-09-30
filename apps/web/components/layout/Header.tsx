import { Container } from '@/components/ui/Primitives';
import type { CategoryNode } from '@/lib/api/types';
import type { Theme } from '@/lib/theme';

import { HeaderActions } from './HeaderActions';
import { MegaMenu } from './MegaMenu';
import { MobileNav } from './MobileNav';
import { Wordmark } from './Wordmark';

interface HeaderProps {
  readonly brandName: string;
  readonly categories: readonly CategoryNode[];
  readonly accountHref: string;
  readonly signedIn: boolean;
  readonly initialTheme: Theme | null;
}

/** Sticky, one hairline, no shadow. The layout resolves data and session; this only renders. */
export function Header({
  brandName,
  categories,
  accountHref,
  signedIn,
  initialTheme,
}: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-header border-b border-hairline bg-bg"
      data-testid="site-header"
    >
      <Container>
        <div className="relative flex min-h-header items-center gap-3 sm:gap-4">
          <MobileNav categories={categories} accountHref={accountHref} signedIn={signedIn} />
          <Wordmark name={brandName} />
          {categories.length > 0 && (
            <div className="hidden h-5 w-px shrink-0 bg-hairline xl:block" aria-hidden="true" />
          )}
          <MegaMenu categories={categories} />
          <HeaderActions
            categories={categories}
            accountHref={accountHref}
            signedIn={signedIn}
            initialTheme={initialTheme}
          />
        </div>
      </Container>
    </header>
  );
}
