import crypto from 'node:crypto';

import type { CookieOptions, Request, Response } from 'express';

import config from '../config';
import prisma from './prisma';

const TOKEN_BYTES = 32;

export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

const cookieOptions = (maxAgeMs: number): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProduction,
  path: '/',
  maxAge: maxAgeMs,
  ...(config.session.cookieDomain ? { domain: config.session.cookieDomain } : {}),
});

export async function createSession(
  res: Response,
  req: Request,
  userId: string,
): Promise<void> {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  const ttlMs = config.session.ttlDays * 24 * 60 * 60 * 1000;

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
      ip: req.ip ?? null,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });

  res.cookie(config.session.cookieName, token, cookieOptions(ttlMs));
}

export async function destroySession(
  res: Response,
  token: string | undefined,
): Promise<void> {
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  res.clearCookie(config.session.cookieName, cookieOptions(0));
}

export async function destroyAllSessions(userId: string): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { userId } });
  return count;
}

export const readSessionToken = (req: Request): string | undefined =>
  req.cookies?.[config.session.cookieName] as string | undefined;

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  name: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  avatarUrl: string | null;
  emailVerified: boolean;
  ownedRestaurantIds: string[];
};

export async function resolveSession(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
          role: true,
          avatarUrl: true,
          emailVerified: true,
          isActive: true,
          ownedRestaurants: { select: { restaurantId: true } },
        },
      },
    },
  });

  if (!session) return null;

  if (session.expiresAt < new Date() || !session.user.isActive) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => null);
    return null;
  }

  const { user } = session;
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
    ownedRestaurantIds: user.ownedRestaurants.map((o) => o.restaurantId),
  };
}
