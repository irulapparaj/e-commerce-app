/**
 * seed-images.ts — downloads a free Wikimedia Commons image for each seed product,
 * processes it into all required derivative sizes via sharp, and uploads to MinIO.
 *
 * Usage:
 *   pnpm --filter @pe/api seed:images
 *
 * Idempotent: skips products whose seed-1 derivatives already look like real photos
 * (> 30 KB at 1024 px).  Set SEED_IMAGES_FORCE=true to unconditionally overwrite.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';

import { DERIVATIVE_FORMATS, DERIVATIVE_WIDTHS, derivativeKey } from '../src/modules/media/url.js';
import { slugify } from './seed-runner.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const S3_ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
const S3_REGION = process.env.S3_REGION ?? 'ap-south-1';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY ?? 'minioadmin';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY ?? 'minioadmin';
const BUCKET = process.env.S3_BUCKET_MEDIA ?? 'media';
const FORCE = process.env.SEED_IMAGES_FORCE === 'true';

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'seed-data');

// ---------------------------------------------------------------------------
// Per-product Wikimedia Commons search queries (multiple candidates per product)
// ---------------------------------------------------------------------------

const IMAGE_QUERIES: Record<string, readonly string[]> = {
  'PE-AG-001': ['agarbatti incense sticks', 'incense sticks India masala'],
  'PE-AG-002': ['sandalwood incense sticks', 'sandal incense'],
  'PE-AG-003': ['rose incense sticks', 'rose fragrance flowers'],
  'PE-AG-004': ['citronella plant', 'incense stick burning'],
  'PE-AG-005': ['jasmine flowers India', 'jasmine incense'],
  'PE-AG-006': ['agarwood tree', 'incense pouch premium', 'oud wood chips'],
  'PE-DH-001': ['sandalwood paste chandan', 'dhoop incense India'],
  'PE-DH-002': ['guggul resin gum', 'incense resin India'],
  'PE-DH-003': ['lavender field flowers', 'lavender incense'],
  'PE-DH-004': ['incense cone burning', 'cone incense smoke'],
  'PE-DH-005': ['frankincense resin', 'benzoin resin loban'],
  'PE-PS-001': ['camphor crystal tablet', 'camphor India puja'],
  'PE-PS-002': ['brass diya India', 'brass lamp puja'],
  'PE-PS-003': ['smoke incense India ritual', 'incense burning India temple'],
  'PE-PS-004': ['diya oil lamp India', 'cotton wick lamp'],
  'PE-PS-005': ['hawan fire ceremony', 'Ayurveda herbs mix India'],
  'PE-PS-006': ['Ganges river India', 'holy water India'],
  'PE-AC-001': ['reed diffuser bottle', 'home fragrance diffuser'],
  'PE-AC-002': ['lemongrass plant', 'lemongrass essential oil'],
  'PE-AC-003': ['car interior fragrance', 'car air freshener'],
  'PE-HF-001': ['vanilla scented candle', 'candle burning glass'],
  'PE-HF-002': ['bakhoor oud burner', 'incense charcoal burning'],
  'PE-BF-001': ['rose perfume oil attar', 'rose attar India'],
  'PE-MO-001': ['incense burner ceramic', 'backflow incense waterfall'],
};

// ---------------------------------------------------------------------------
// Wikimedia Commons — MediaWiki Action API helpers (more lenient rate limits)
// ---------------------------------------------------------------------------

const MW_API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'PujaEssentialsSeed/1.0 (https://github.com/puja-essentials; dev)';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface MwSearchResult {
  query?: { search?: Array<{ title: string }> };
}

interface MwImageInfoResult {
  query?: {
    pages?: Record<
      string,
      { imageinfo?: Array<{ url: string; mime: string; size?: number; width?: number; height?: number }> }
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
  if ((info.size ?? 0) > 0 && (info.size ?? 0) < 20_000) return null; // skip tiny thumbnails
  if ((info.width ?? 0) > 0 && (info.width ?? 0) < 400) return null; // too small
  return info.url;
}

async function findImageUrl(sku: string, queries: readonly string[]): Promise<string | null> {
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

/** Returns true only if the key already exists and looks like a real photo (> 30 KB). */
async function isRealImageAlready(s3: S3Client, baseKey: string): Promise<boolean> {
  const key = derivativeKey(baseKey, 1024, 'webp');
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

interface ProductSeed {
  sku: string;
  name: string;
}

const main = async (): Promise<void> => {
  const products = JSON.parse(
    readFileSync(resolve(DATA_DIR, 'products.json'), 'utf8'),
  ) as ProductSeed[];

  const s3 = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  });

  await ensureBucket(s3);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const product of products) {
    const slug = slugify(product.name);
    const baseKey = `products/${slug}/seed-1`;

    process.stdout.write(`[${product.sku}] ${product.name} … `);

    if (!FORCE && (await isRealImageAlready(s3, baseKey))) {
      console.log('skipped (real image already present)');
      skipped++;
      continue;
    }

    const queries = IMAGE_QUERIES[product.sku];
    if (queries === undefined) {
      console.log('skipped (no query configured)');
      skipped++;
      continue;
    }

    process.stdout.write('\n  searching Wikimedia…\n');
    const imageUrl = await findImageUrl(product.sku, queries);

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
      uploaded++;
    } catch (err) {
      console.error(`  ✗ error: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }

    await sleep(1_000); // breathe between products
  }

  console.log(`\nDone. uploaded=${uploaded}  skipped=${skipped}  failed=${failed}`);
  if (failed > 0) {
    console.log('Some products had no matching image on Wikimedia Commons.');
    console.log('Re-run later (rate limits reset hourly) or set SEED_IMAGES_FORCE=true to retry.');
    process.exit(1);
  }
};

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
