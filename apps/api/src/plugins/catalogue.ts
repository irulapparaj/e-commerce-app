import { createJsonCache } from '../lib/cache';
import { sharedPlugin } from '../lib/plugin';
import { createCategoryService, type CategoryService } from '../modules/catalogue/category.service';
import { createImageService, type ImageService } from '../modules/catalogue/image.service';
import { createProductService, type ProductService } from '../modules/catalogue/product.service';
import type { CatalogueServiceDeps } from '../modules/catalogue/service-deps';
import { createVariantService, type VariantService } from '../modules/catalogue/variant.service';
import {
  createMediaPresignService,
  type MediaPresignService,
} from '../modules/media/presign.service';
import type { MediaProcessDeps } from '../modules/media/process.job';
import { createImageUrlBuilder } from '../modules/media/url';
import { createRevalidateNotifier } from '../modules/revalidate/notify';
import { createSettingsStore } from '../modules/settings/store';

export interface CatalogueServices {
  readonly products: ProductService;
  readonly variants: VariantService;
  readonly images: ImageService;
  readonly categories: CategoryService;
}

export interface MediaServices extends MediaPresignService {
  readonly processDeps: MediaProcessDeps;
}

/** Wires cache, settings, image URLs, revalidation, catalogue write services and media (P04). */
export const cataloguePlugin = sharedPlugin(async (app) => {
  const cache = createJsonCache(app.valkey, app.log);
  const bucket = app.env.S3_BUCKET_MEDIA;
  const imageUrls = createImageUrlBuilder({
    publicBaseUrl: app.env.MEDIA_PUBLIC_BASE_URL,
    storage: app.ports.storage,
    bucket,
  });
  const revalidate = createRevalidateNotifier(app.jobs);
  const settings = createSettingsStore({ prisma: app.prisma, cache, log: app.log });
  const deps: CatalogueServiceDeps = {
    prisma: app.prisma,
    revalidate,
    cache,
    storage: app.ports.storage,
    bucket,
  };
  const catalogue: CatalogueServices = {
    products: createProductService(deps),
    variants: createVariantService(deps),
    images: createImageService(deps),
    categories: createCategoryService(deps),
  };
  const media: MediaServices = {
    ...createMediaPresignService({
      prisma: app.prisma,
      storage: app.ports.storage,
      bucket,
      jobs: app.jobs,
    }),
    processDeps: {
      prisma: app.prisma,
      storage: app.ports.storage,
      bucket,
      revalidate,
      log: app.log,
    },
  };

  app.decorate('cache', cache);
  app.decorate('imageUrls', imageUrls);
  app.decorate('revalidate', revalidate);
  app.decorate('settings', settings);
  app.decorate('catalogue', catalogue);
  app.decorate('media', media);
});
