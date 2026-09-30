/**
 * seed-category-images.ts — downloads a free Wikimedia Commons image for each
 * top-level category, processes it into all required derivative sizes via sharp,
 * uploads to MinIO, and writes the imageKey back to the category row.
 *
 * Usage:
 *   pnpm --filter @pe/api seed:category-images
 *
 * Idempotent: skips categories whose seed-cover 640w webp derivative already
 * exists and is > 30 KB.  Set SEED_IMAGES_FORCE=true to unconditionally overwrite.
 */

import {
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';

import { DERIVATIVE_FORMATS, DERIVATIVE_WIDTHS, derivativeKey } from '../src/modules/media/url.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const S3_ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
const S3_REGION = process.env.S3_REGION ?? 'ap-south-1';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY ?? 'minioadmin';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY ?? 'minioadmin';
const BUCKET = process.env.S3_BUCKET_MEDIA ?? 'media';
const FORCE = process.env.SEED_IMAGES_FORCE === 'true';

// ---------------------------------------------------------------------------
// Per-category Wikimedia Commons search queries (multiple candidates per slug)
// ---------------------------------------------------------------------------

const CATEGORY_QUERIES: Record<string, readonly string[]> = {
  agarbatti: ['agarbatti incense sticks India', 'incense sticks burning'],
  dhoop: ['dhoop sticks incense India', 'incense stick smoke India'],
  'puja-samagri': ['puja items India altar', 'Hindu puja ritual India'],
  'air-care': ['reed diffuser home fragrance', 'aroma diffuser bottle'],
  'home-fragrance': ['scented candle luxury home', 'candle burning romantic'],
  'body-fragrance': ['perfume bottle attar oil', 'rose perfume fragrance'],
  more: ['incense burner ceramic decorative', 'lotus incense burner'],
};

// ---------------------------------------------------------------------------
// Wikimedia Commons — MediaWiki Action API helpers
// ---------------------------------------------------------------------------

const MW_API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'PujaEssentialsSeed/1.0 (dev)';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface MwSearchResult {
  query?: { search?: Array<{ title: string }> };
}

interface MwImageInfoResult {
  query?: {
    pages?: Record<
      string,
      {
        imageinfo?: Array<{
          url: string;
          mime: string;
          size?: number;
          width?: number;
          height?: number;
        }>;
      }
    >;
  };
}

async function searchCommons(query: string): Promise<string[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srnamespace: '6',
    srsearch: query,
    srlimit: '8',
    format: 'json',
    origin: '*',
  });
  const res = await fetch(`${MW_API}?${params}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as MwSearchResult;
  return (data.query?.search ?? []).map((r) => r.title);
}

async function getImageUrl(title: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: 'query',
    titles: title,
    prop: 'imageinfo',
    iiprop: 'url|mime|size|dimensions',
    format: 'json',
    origin: '*',
  });
  const res = await fetch(`${MW_API}?${params}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as MwImageInfoResult;
  const pages = Object.values(data.query?.pages ?? {});
  const info = pages[0]?.imageinfo?.[0];
  if (info === undefined) return null;

  if (!info.mime.startsWith('image/jpeg') && !info.mime.startsWith('image/png')) return null;
  if ((info.size ?? 0) > 0 && (info.size ?? 0) < 20_000) return null;
  if ((info.width ?? 0) > 0 && (info.width ?? 0) < 400) return null;
  return info.url;
}

async function findImageUrl(slug: string, queries: readonly string[]): Promise<string | null> {
  for (const query of queries) {
    await sleep(500); // be polite to Wikimedia
    const titles = await searchCommons(query);
    for (const title of titles) {
      await sleep(300);
      const url = await getImageUrl(title);
      if (url !== null) {
        console.log(`  ✓ "${query}" → ${title}`);
        return url;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Image processing + MinIO upload
// ---------------------------------------------------------------------------

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function processAndUpload(s3: S3Client, imgBuf: Buffer, baseKey: string): Promise<void> {
  await Promise.all(
    DERIVATIVE_WIDTHS.flatMap((width) =>
      DERIVATIVE_FORMATS.map(async (format) => {
        const body = await sharp(imgBuf)
          .resize(width, width, { fit: 'cover', position: 'attention' })
          .toFormat(format, { quality: 85 })
          .toBuffer();
        await s3.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: derivativeKey(baseKey, width, format),
            Body: body,
            ContentType: `image/${format}`,
          }),
        );
      }),
    ),
  );
}

/** Returns true only if the 640w webp derivative already exists and is > 30 KB. */
async function isRealImageAlready(s3: S3Client, baseKey: string): Promise<boolean> {
  const key = derivativeKey(baseKey, 640, 'webp');
  try {
    const result = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return (result.ContentLength ?? 0) > 30_000;
  } catch {
    return false;
  }
}

async function ensureBucket(s3: S3Client): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
      console.log(`created bucket "${BUCKET}"`);
    } catch (err) {
      const code = (err as { Code?: string }).Code ?? (err as { code?: string }).code ?? '';
      if (code !== 'BucketAlreadyOwnedByYou') throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL ?? 'postgresql://pe:pe@localhost:5432/pe' } },
  });

  const s3 = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  });

  try {
    await ensureBucket(s3);

    let uploaded = 0;
    let skipped = 0;
    let failed = 0;

    for (const [slug, queries] of Object.entries(CATEGORY_QUERIES)) {
      const baseKey = `categories/${slug}/seed-cover`;

      process.stdout.write(`[${slug}] … `);

      if (!FORCE && (await isRealImageAlready(s3, baseKey))) {
        console.log('skipped (real image already present)');
        skipped++;
        continue;
      }

      process.stdout.write('\n  searching Wikimedia…\n');
      const imageUrl = await findImageUrl(slug, queries);

      if (imageUrl === null) {
        console.log(`  ✗ no suitable image found on Wikimedia Commons`);
        failed++;
        continue;
      }

      try {
        process.stdout.write(`  downloading…\n`);
        const buffer = await downloadImage(imageUrl);
        await processAndUpload(s3, buffer, baseKey);
        const count = DERIVATIVE_WIDTHS.length * DERIVATIVE_FORMATS.length;
        console.log(`  ✓ uploaded ${count} derivatives to ${baseKey}`);

        await prisma.category.updateMany({
          where: { slug },
          data: { imageKey: baseKey },
        });
        console.log(`  ✓ updated imageKey for category slug="${slug}"`);

        uploaded++;
      } catch (err) {
        console.error(`  ✗ error: ${err instanceof Error ? err.message : String(err)}`);
        failed++;
      }

      await sleep(1_000); // breathe between categories
    }

    console.log(`\nDone. uploaded=${uploaded}  skipped=${skipped}  failed=${failed}`);
    if (failed > 0) {
      console.log('Some categories had no matching image on Wikimedia Commons.');
      console.log('Re-run later (rate limits reset hourly) or set SEED_IMAGES_FORCE=true to retry.');
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
