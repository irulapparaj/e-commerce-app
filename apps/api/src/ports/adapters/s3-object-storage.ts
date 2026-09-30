import type { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { type ApiEnv, AppError } from '@pe/shared';

import type {
  ListObjectsInput,
  ObjectHead,
  ObjectRef,
  ObjectSummary,
  ObjectStoragePort,
  PresignedUpload,
  PresignPutInput,
  PutObjectInput,
} from '../object-storage';

const LIST_PAGE_MAX = 1000;
const LIST_DEFAULT_LIMIT = 10_000;

const isNotFound = (error: unknown): boolean => {
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  const name = (error as { name?: string }).name;
  return status === 404 || name === 'NotFound' || name === 'NoSuchKey';
};

export class S3ObjectStorageAdapter implements ObjectStoragePort {
  private readonly client: S3Client;

  constructor(client: S3Client) {
    this.client = client;
  }

  static configFromEnv(
    env: Pick<
      ApiEnv,
      'S3_ENDPOINT' | 'S3_REGION' | 'S3_ACCESS_KEY' | 'S3_SECRET_KEY' | 'S3_FORCE_PATH_STYLE'
    >,
  ): S3ClientConfig {
    return {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    };
  }

  static fromEnv(
    env: Parameters<typeof S3ObjectStorageAdapter.configFromEnv>[0],
  ): S3ObjectStorageAdapter {
    return new S3ObjectStorageAdapter(new S3Client(S3ObjectStorageAdapter.configFromEnv(env)));
  }

  async presignPut(input: PresignPutInput): Promise<PresignedUpload> {
    if (input.sizeBytes <= 0 || input.sizeBytes > input.maxBytes) {
      throw new AppError('VALIDATION', `File size must be between 1 and ${input.maxBytes} bytes`);
    }
    const command = new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: input.expiresSec,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    return {
      url,
      method: 'PUT',
      headers: { 'content-type': input.contentType, 'content-length': String(input.sizeBytes) },
    };
  }

  async presignGet(input: ObjectRef & { readonly expiresSec: number }): Promise<{ url: string }> {
    const command = new GetObjectCommand({ Bucket: input.bucket, Key: input.key });
    return { url: await getSignedUrl(this.client, command, { expiresIn: input.expiresSec }) };
  }

  async list(input: ListObjectsInput): Promise<readonly ObjectSummary[]> {
    const limit = input.limit ?? LIST_DEFAULT_LIMIT;
    const collected: ObjectSummary[] = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: input.bucket,
          Prefix: input.prefix,
          MaxKeys: Math.min(LIST_PAGE_MAX, limit - collected.length),
          ...(token === undefined ? {} : { ContinuationToken: token }),
        }),
      );
      for (const object of page.Contents ?? []) {
        if (object.Key !== undefined && object.LastModified !== undefined)
          collected.push({
            key: object.Key,
            size: object.Size ?? 0,
            lastModified: object.LastModified,
          });
      }
      token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
    } while (token !== undefined && collected.length < limit);
    return collected;
  }

  async head(ref: ObjectRef): Promise<ObjectHead> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: ref.bucket, Key: ref.key }),
      );
      return {
        exists: true,
        ...(result.ContentLength === undefined ? {} : { size: result.ContentLength }),
        ...(result.ContentType === undefined ? {} : { contentType: result.ContentType }),
      };
    } catch (error) {
      if (isNotFound(error)) return { exists: false };
      throw error;
    }
  }

  async delete(ref: ObjectRef): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: ref.bucket, Key: ref.key }));
  }

  async getStream(ref: ObjectRef): Promise<Readable> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: ref.bucket, Key: ref.key }),
    );
    if (result.Body === undefined) throw new AppError('NOT_FOUND', `Object ${ref.key} has no body`);
    return result.Body as Readable;
  }

  async put(input: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  }

  async headBucket(bucket: string): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }
}
