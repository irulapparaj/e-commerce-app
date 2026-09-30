import type {
  AdminCategoryNode,
  AdminImage,
  AdminProductDetail,
  AdminVariant,
  MovementRow,
  StockRow,
} from '@/lib/admin/catalogue-types';

/** Shared fixtures for the P06 component tests. Ids are UUIDs because the shared schemas insist. */

export const IDS = {
  agarbatti: '11111111-1111-4111-8111-111111111101',
  premium: '11111111-1111-4111-8111-111111111102',
  flora: '11111111-1111-4111-8111-111111111103',
  dhoop: '11111111-1111-4111-8111-111111111104',
  product: '22222222-2222-4222-8222-222222222201',
  variant1: '33333333-3333-4333-8333-333333333301',
  variant2: '33333333-3333-4333-8333-333333333302',
  image1: '44444444-4444-4444-8444-444444444401',
  image2: '44444444-4444-4444-8444-444444444402',
} as const;

export const childCategory: AdminCategoryNode = {
  id: IDS.premium,
  slug: 'agarbatti-premium',
  name: 'Premium',
  parentId: IDS.agarbatti,
  sortOrder: 1,
  imageKey: null,
  imageUrl: null,
  metaTitle: null,
  metaDescription: null,
  productCount: 3,
  children: [],
};

export const categoryTree: readonly AdminCategoryNode[] = [
  {
    id: IDS.agarbatti,
    slug: 'agarbatti',
    name: 'Agarbatti',
    parentId: null,
    sortOrder: 1,
    imageKey: 'categories/c1.png',
    imageUrl: 'https://cdn.test/categories/c1-640.webp',
    metaTitle: null,
    metaDescription: null,
    productCount: 5,
    children: [
      childCategory,
      {
        ...childCategory,
        id: IDS.flora,
        slug: 'agarbatti-flora',
        name: 'Flora',
        sortOrder: 2,
        productCount: 0,
      },
    ],
  },
  {
    id: IDS.dhoop,
    slug: 'dhoop',
    name: 'Dhoop',
    parentId: null,
    sortOrder: 2,
    imageKey: null,
    imageUrl: null,
    metaTitle: 'Dhoop',
    metaDescription: null,
    productCount: 0,
    children: [],
  },
];

export const variant: AdminVariant = {
  id: IDS.variant1,
  sku: 'ROSE-50',
  label: '50 g',
  price: 19900,
  compareAtPrice: 24900,
  stock: 10,
  lowStockThreshold: 5,
  weightGrams: 60,
  isDefault: true,
};

export const image: AdminImage = {
  id: IDS.image1,
  objectKey: 'products/p1/a.png',
  alt: 'Front',
  sortOrder: 0,
  url: 'https://cdn.test/products/p1/a-640.webp',
  thumbUrl: 'https://cdn.test/products/p1/a-320.webp',
};

export const product: AdminProductDetail = {
  id: IDS.product,
  name: 'Rose Agarbatti',
  slug: 'rose-agarbatti',
  sku: 'ROSE',
  description: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fragrant rose sticks.' }] }],
  },
  specifications: { Weight: '50 g' },
  howToUse: 'Light and enjoy.',
  categoryId: IDS.premium,
  hsnCode: '3307',
  gstRate: 5,
  tags: ['rose'],
  isActive: false,
  isFeatured: false,
  metaTitle: null,
  metaDescription: null,
  variants: [
    variant,
    {
      ...variant,
      id: IDS.variant2,
      sku: 'ROSE-100',
      label: '100 g',
      price: 34900,
      compareAtPrice: null,
      stock: 2,
      isDefault: false,
    },
  ],
  images: [
    image,
    {
      ...image,
      id: IDS.image2,
      objectKey: 'products/p1/b.png',
      alt: '',
      sortOrder: 1,
      thumbUrl: 'https://cdn.test/products/p1/b-320.webp',
    },
  ],
  everOrdered: false,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-25T00:00:00.000Z',
};

export const stockRow: StockRow = {
  variantId: IDS.variant1,
  sku: 'ROSE-50',
  productId: IDS.product,
  productName: 'Rose Agarbatti',
  productSlug: 'rose-agarbatti',
  label: '50 g',
  stock: 10,
  lowStockThreshold: 5,
  isLow: false,
  lastMovementAt: '2026-09-25T04:00:00.000Z',
};

export const movementRow: MovementRow = {
  id: '55555555-5555-4555-8555-555555555501',
  variantId: IDS.variant1,
  sku: 'ROSE-50',
  productName: 'Rose Agarbatti',
  label: '50 g',
  delta: -5,
  reason: 'ADJUSTMENT',
  referenceId: null,
  actor: { id: 'u1', email: 'staff@example.test' },
  note: 'Damaged in transit',
  createdAt: '2026-09-25T04:00:00.000Z',
};
