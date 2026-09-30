'use client';

import { Accordion } from '@/components/ui/Accordion';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Icon, ICON_NAMES } from '@/components/ui/Icon';
import { ExternalLink, Link } from '@/components/ui/Link';
import { Pagination } from '@/components/ui/Pagination';
import { Grid, Rule, Stack } from '@/components/ui/Primitives';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';

import { GallerySection, Specimen } from './GallerySection';

const GRID_CELLS = 12;

export function GalleryNavigation() {
  return (
    <>
      <GallerySection id="navigation" title="Tabs · Accordion · Breadcrumb · Pagination">
        <div className="w-full max-w-lg">
          <Tabs defaultValue="description">
            <Tabs.List label="Product details">
              <Tabs.Tab value="description">Description</Tabs.Tab>
              <Tabs.Tab value="specs">Specifications</Tabs.Tab>
              <Tabs.Tab value="use">How to use</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="description">
              <p className="text-muted">Hand-rolled masala agarbatti with a slow, even burn.</p>
            </Tabs.Panel>
            <Tabs.Panel value="specs">
              <p className="text-muted">20 sticks · 45 minutes each · bamboo core</p>
            </Tabs.Panel>
            <Tabs.Panel value="use">
              <p className="text-muted">
                Light the tip, let it flame for a second, then blow it out.
              </p>
            </Tabs.Panel>
          </Tabs>
        </div>
        <div className="w-full max-w-lg">
          <Accordion defaultOpen={['shipping']}>
            <Accordion.Item id="shipping" title="Shipping">
              Dispatched from Chennai within one working day.
            </Accordion.Item>
            <Accordion.Item id="returns" title="Returns">
              Fifteen days from delivery for unopened packs.
            </Accordion.Item>
          </Accordion>
        </div>
        <Specimen label="breadcrumb" wide>
          <Breadcrumb
            items={[
              { label: 'Home', href: '/' },
              { label: 'Agarbatti', href: '/collections/agarbatti' },
              { label: 'Royale Masala' },
            ]}
          />
        </Specimen>
        <Specimen label="pagination" wide>
          <Pagination
            page={5}
            totalPages={12}
            hrefFor={(page) => `/collections/agarbatti?page=${page}`}
          />
        </Specimen>
      </GallerySection>

      <GallerySection id="links" title="Link · Icon">
        <Specimen label="inline">
          <p>
            Read the <Link href="/policies/shipping">shipping policy</Link> before ordering.
          </p>
        </Specimen>
        <Specimen label="nav">
          <Link href="/collections/dhoop" variant="nav">
            Dhoop
          </Link>
        </Specimen>
        <Specimen label="quiet">
          <Link href="/pages/contact" variant="quiet">
            Contact
          </Link>
        </Specimen>
        <Specimen label="external">
          <ExternalLink href="https://www.instagram.com/">Instagram</ExternalLink>
        </Specimen>
        <Specimen label="icons" wide>
          <ul className="flex flex-wrap gap-4">
            {ICON_NAMES.map((name) => (
              <li key={name} className="flex flex-col items-center gap-1 text-caption text-subtle">
                <Icon name={name} size={24} />
                {name}
              </li>
            ))}
          </ul>
        </Specimen>
      </GallerySection>

      <GallerySection id="skeleton" title="Skeleton · Grid · Stack · Rule">
        <div className="grid w-full grid-cols-2 gap-4 md:grid-cols-4">
          <div className="flex flex-col gap-3">
            <Skeleton variant="image" />
            <Skeleton variant="text" width="three-quarters" />
            <Skeleton variant="text" width="third" />
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton variant="heading" width="half" />
            <Skeleton variant="text" lines={3} />
          </div>
          <Skeleton variant="block" />
          <Skeleton variant="circle" />
        </div>
        <div className="w-full">
          <Grid>
            {Array.from({ length: GRID_CELLS }, (_, index) => (
              <div key={index} className="h-8 rounded-image border border-hairline bg-surface" />
            ))}
          </Grid>
          <Rule />
          <Stack direction="row" gap={2} wrap>
            <span className="rounded-control border border-hairline px-3 py-1">gap 16</span>
            <span className="rounded-control border border-hairline px-3 py-1">
              on the 8-pt grid
            </span>
          </Stack>
        </div>
      </GallerySection>
    </>
  );
}
