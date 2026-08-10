import crypto from 'node:crypto';

import { StatusCodes } from 'http-status-codes';

import config from '../../../config';
import ApiError from '../../../errors/ApiError';

export const GOOGLE_STATE_COOKIE = 'omomoom_oauth_state';

export const redirectUri = (): string =>
  `${config.apiUrl}${config.apiPrefix}/auth/google/callback`;

export const newState = (): string => crypto.randomBytes(16).toString('base64url');

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.google.clientId ?? '',
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type TokenResponse = { id_token?: string; error_description?: string };

export type GoogleProfile = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
};

export async function exchangeCode(code: string): Promise<GoogleProfile> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId ?? '',
      client_secret: config.google.clientSecret ?? '',
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });

  const token = (await response.json()) as TokenResponse;

  if (!response.ok || !token.id_token) {
    throw new ApiError(
      StatusCodes.BAD_GATEWAY,
      token.error_description ?? 'Google rejected the sign-in attempt',
    );
  }

  return verifyIdToken(token.id_token);
}

type Jwk = { kid: string; n: string; e: string; alg: string; kty: string };

let jwkCache: { keys: Jwk[]; expiresAt: number } | null = null;

async function googleKeys(): Promise<Jwk[]> {
  if (jwkCache && jwkCache.expiresAt > Date.now()) return jwkCache.keys;

  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!response.ok) {
    throw new ApiError(StatusCodes.BAD_GATEWAY, 'Could not reach Google to verify the sign-in');
  }

  const body = (await response.json()) as { keys: Jwk[] };
  const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '');
  jwkCache = {
    keys: body.keys,
    expiresAt: Date.now() + Number(maxAge?.[1] ?? 3600) * 1000,
  };
  return body.keys;
}

const decodeSegment = (segment: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;

/**
 * The id_token comes straight from Google over TLS on a request we initiated,
 * so the signature is belt and braces, but verifying it means a leaked client
 * secret alone cannot mint identities.
 */
async function verifyIdToken(idToken: string): Promise<GoogleProfile> {
  const [rawHeader, rawPayload, rawSignature] = idToken.split('.');
  const invalid = new ApiError(StatusCodes.UNAUTHORIZED, 'That Google sign-in could not be verified');

  if (!rawHeader || !rawPayload || !rawSignature) throw invalid;

  const header = decodeSegment(rawHeader) as { kid?: string; alg?: string };
  const key = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!key || header.alg !== 'RS256') throw invalid;

  const verified = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${rawHeader}.${rawPayload}`),
    crypto.createPublicKey({ key, format: 'jwk' }),
    Buffer.from(rawSignature, 'base64url'),
  );
  if (!verified) throw invalid;

  const payload = decodeSegment(rawPayload) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
    aud?: string;
    iss?: string;
    exp?: number;
  };

  const issuerOk =
    payload.iss === 'https://accounts.google.com' ||
    payload.iss === 'accounts.google.com';

  if (
    !issuerOk ||
    payload.aud !== config.google.clientId ||
    !payload.sub ||
    !payload.email ||
    (payload.exp ?? 0) * 1000 < Date.now()
  ) {
    throw invalid;
  }

  return {
    sub: payload.sub,
    email: payload.email,
    email_verified: Boolean(payload.email_verified),
    name: payload.name,
    picture: payload.picture,
  };
}
