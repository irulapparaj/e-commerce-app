import type { Readable } from 'node:stream';

export interface PresignPutInput {
  readonly bucket: string;
  readonly key: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly maxBytes: number;
  readonly expiresSec: number;
}

export interface PresignedUpload {
  readonly url: string;
  readonly method: 'PUT';
  readonly headers: Readonly<Record<string, string>>;
}

export interface ObjectRef {
  readonly bucket: string;
  readonly key: string;
}

export interface ObjectHead {
  readonly exists: boolean;
  readonly size?: number;
  readonly contentType?: string;
}

export interface PutObjectInput extends ObjectRef {
  readonly body: Buffer | Readable | string;
  readonly contentType: string;
}

export interface ObjectStoragePort {
  presignPut(input: PresignPutInput): Promise<PresignedUpload>;
  presignGet(input: ObjectRef & { readonly expiresSec: number }): Promise<{ url: string }>;
  head(ref: ObjectRef): Promise<ObjectHead>;
  delete(ref: ObjectRef): Promise<void>;
  getStream(ref: ObjectRef): Promise<Readable>;
  put(input: PutObjectInput): Promise<void>;
  headBucket(bucket: string): Promise<boolean>;
}
