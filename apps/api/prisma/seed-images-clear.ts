/**
 * seed-images-clear.ts — removes all demo seed images from MinIO so the
 * real product images can be uploaded later.
 *
 * Usage:
 *   pnpm --filter @pe/api seed:images:clear
 *
 * Also clears the product descriptions back to the generic placeholder by
 * re-running the database seed with --clear-descriptions flag (see instructions
 * printed at the end).
 */

import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

const S3_ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
const S3_REGION = process.env.S3_REGION ?? 'ap-south-1';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY ?? 'minioadmin';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY ?? 'minioadmin';
const BUCKET = process.env.S3_BUCKET_MEDIA ?? 'media';

const PREFIX = 'products/';

const main = async (): Promise<void> => {
  const s3 = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  });

  let deleted = 0;
  let token: string | undefined;

  console.log(`Scanning s3://${BUCKET}/${PREFIX} for seed derivatives…`);

  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: PREFIX,
        ContinuationToken: token,
      }),
    );

    const seedKeys = (page.Contents ?? [])
      .map((obj) => obj.Key ?? '')
      .filter((key) => key.includes('/seed-'));

    await Promise.all(
      seedKeys.map(async (key) => {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
        console.log(`  deleted: ${key}`);
        deleted++;
      }),
    );

    token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
  } while (token !== undefined);

  console.log(`\nRemoved ${deleted} seed image derivative(s) from MinIO.`);
  console.log(`\nTo also clear the demo descriptions from the database, update`);
  console.log(`apps/api/prisma/seed-data/products.json — remove or blank each`);
  console.log(`"description" field — then re-run:  pnpm --filter @pe/api db:seed`);
};

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
