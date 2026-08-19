import { randomUUID } from 'node:crypto';

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import config from '../config';

/**
 * Cloudflare R2 speaks the S3 protocol, so nothing here is Cloudflare specific.
 * Point the endpoint at another provider and the rest of the app does not
 * notice, which is the reason for choosing it: the frontend moves to a VPS
 * later and this layer is meant to survive that.
 */
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

/**
 * Keys are random and never reused. Overwriting an existing object would mean
 * fighting a CDN cache for a photo somebody already has in their browser;
 * writing a new key and deleting the old one never has that problem.
 */
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

/**
 * The browser uploads straight to storage, so a large file never occupies a
 * request on our own server. Signing `ContentType` and `ContentLength` is what
 * makes the limits real: a client that sends something other than what it
 * declared gets a signature mismatch from R2, not a pass.
 */
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

/** Best effort. A file left behind costs a fraction of a cent; a failed request costs a user their change. */
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
