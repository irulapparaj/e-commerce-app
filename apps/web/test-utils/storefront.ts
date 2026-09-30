import type { PublicSettings } from '@pe/shared';

import type { CategoryNode } from '@/lib/api/types';

/** Fixtures with the exact `GET /api/v1/categories` and `GET /api/v1/settings/public` shapes (P04). */

const child = (slug: string, name: string, imageUrl: string | null = null): CategoryNode => ({
  id: `id-${slug}`,
  slug,
  name,
  imageUrl,
  children: [],
});

export const categoryTree: readonly CategoryNode[] = [
  {
    id: 'id-agarbatti',
    slug: 'agarbatti',
    name: 'Agarbatti',
    imageUrl: 'https://media.test/categories/agarbatti-640.webp',
    children: [
      child('agarbatti-bambooless', 'Bambooless'),
      child('agarbatti-premium', 'Premium', 'https://media.test/categories/premium-640.webp'),
      child('agarbatti-royale-masala', 'Royale Masala'),
      child('agarbatti-flora', 'Flora'),
      child('agarbatti-combos', 'Combos'),
    ],
  },
  {
    id: 'id-dhoop',
    slug: 'dhoop',
    name: 'Dhoop',
    imageUrl: null,
    children: [
      child('dhoop-wet', 'Wet Dhoop', 'https://media.test/categories/wet-dhoop-640.webp'),
      child('dhoop-sticks', 'Dhoop Sticks'),
      child('dhoop-cones', 'Dhoop Cones'),
    ],
  },
  {
    id: 'id-puja-samagri',
    slug: 'puja-samagri',
    name: 'Puja Samagri',
    imageUrl: null,
    children: [child('camphor', 'Camphor'), child('hawan-samagri', 'Hawan Samagri')],
  },
  { id: 'id-gifting', slug: 'gifting', name: 'Gifting', imageUrl: null, children: [] },
];

export const publicSettings: PublicSettings = {
  brand: {
    name: 'Invita Company',
    tagline: 'Quality products, thoughtfully delivered.',
    logoKey: null,
  },
  announcementBar: { enabled: true, text: 'Free shipping on orders above ₹599' },
  promoPopup: { enabled: false, delaySeconds: 5 },
  freeShippingThreshold: 59_900,
  pickupLocation: { city: 'Chennai' },
  business: {
    legalName: 'Invita Company (placeholder)',
    gstin: '33AAAAA0000A1Z5',
    addressLines: ['Placeholder address', 'Chennai 600001'],
    isPlaceholder: true,
  },
  returnWindowDays: 15,
};

export const categoriesEnvelope = { success: true, data: categoryTree, error: null } as const;
export const settingsEnvelope = { success: true, data: publicSettings, error: null } as const;
