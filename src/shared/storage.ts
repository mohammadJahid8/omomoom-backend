import { randomUUID } from 'node:crypto';

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import config from '../config';

/** Plain S3 protocol, so the provider can change without touching callers. */
const client = config.storage.enabled
  ? new S3Client({
      region: 'auto',
      endpoint: config.storage.endpoint,
      credentials: {
        accessKeyId: config.storage.accessKeyId,
        secretAccessKey: config.storage.secretAccessKey,
      },
    })
  : null;

export const storageEnabled = Boolean(client);

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export const IMAGE_TYPES = Object.keys(EXTENSIONS);

export const extensionFor = (contentType: string) =>
  EXTENSIONS[contentType] ?? 'bin';

/** Random and never reused, so a replaced photo never fights a CDN cache. */
export const buildKey = (prefix: string, contentType: string) =>
  `${prefix}/${randomUUID()}.${extensionFor(contentType)}`;

export const publicUrlFor = (key: string) =>
  `${config.storage.publicBaseUrl}/${key}`;

/** True when the URL points at our own bucket rather than, say, Google's CDN. */
export const isOurs = (url: string | null): boolean =>
  Boolean(
    url && config.storage.publicBaseUrl && url.startsWith(`${config.storage.publicBaseUrl}/`),
  );

export const keyFromUrl = (url: string): string | null =>
  isOurs(url) ? url.slice(config.storage.publicBaseUrl.length + 1) : null;

/** Signing type and length is what makes those limits real rather than advisory. */
export const presignUpload = async (input: {
  key: string;
  contentType: string;
  size: number;
  expiresIn?: number;
}): Promise<string> => {
  if (!client) throw new Error('Storage is not configured');

  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.storage.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.size,
    }),
    {
      expiresIn: input.expiresIn ?? 600,
      signableHeaders: new Set(['content-type', 'content-length']),
    },
  );
};

/** Confirms the upload actually happened before we write the URL to a row. */
export const describeObject = async (
  key: string,
): Promise<{ size: number; contentType: string | null } | null> => {
  if (!client) return null;

  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: config.storage.bucket, Key: key }),
    );

    return {
      size: head.ContentLength ?? 0,
      contentType: head.ContentType ?? null,
    };
  } catch {
    return null;
  }
};

/** Best effort: a stray file is cheaper than a failed request. */
export const removeObject = async (key: string): Promise<void> => {
  if (!client) return;

  try {
    await client.send(
      new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: key }),
    );
  } catch {
    // ignored on purpose
  }
};

export type StoredObject = { key: string; size: number; uploadedAt: Date };

/** Walks the whole prefix, a page at a time, so a large bucket stays bounded. */
export const listObjects = async function* (
  prefix: string,
): AsyncGenerator<StoredObject> {
  if (!client) return;

  let token: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: config.storage.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );

    for (const item of page.Contents ?? []) {
      if (!item.Key) continue;
      yield {
        key: item.Key,
        size: item.Size ?? 0,
        uploadedAt: item.LastModified ?? new Date(0),
      };
    }

    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
};
