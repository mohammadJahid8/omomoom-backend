import bcrypt from 'bcryptjs';
import { StatusCodes } from 'http-status-codes';

import config from '../../../config';
import ApiError from '../../../errors/ApiError';
import prisma from '../../../shared/prisma';
import type { SessionUser } from '../../../shared/session';

import { LOCK_AFTER, LOCK_FOR_MINUTES, generateUsername, lockState } from './auth.helpers';

const publicUser = {
  id: true,
  email: true,
  username: true,
  name: true,
  role: true,
  avatarUrl: true,
  emailVerified: true,
  ownedRestaurants: { select: { restaurantId: true } },
} as const;

const shape = <T extends { ownedRestaurants: { restaurantId: string }[] }>({
  ownedRestaurants,
  ...user
}: T) => ({
  ...user,
  ownedRestaurantIds: ownedRestaurants.map((owned) => owned.restaurantId),
});

type RegisterInput = { email: string; password: string; name: string };

const register = async (input: RegisterInput) => {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, passwordHash: true },
  });

  if (existing) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      existing.passwordHash
        ? 'An account with that email already exists'
        : 'That email is already signed up with Google. Continue with Google instead.',
    );
  }

  const username = await generateUsername(input.name, input.email);

  return shape(
    await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        username,
        passwordHash: await bcrypt.hash(input.password, config.bcryptSaltRounds),
      },
      select: publicUser,
    }),
  );
};

const login = async (input: { email: string; password: string }) => {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      ...publicUser,
      passwordHash: true,
      isActive: true,
      failedLoginCount: true,
      lockedUntil: true,
    },
  });

  const invalid = new ApiError(
    StatusCodes.UNAUTHORIZED,
    'That email and password do not match',
  );

  if (!user || !user.passwordHash) throw invalid;

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new ApiError(
      StatusCodes.TOO_MANY_REQUESTS,
      `Too many attempts. Try again in ${LOCK_FOR_MINUTES} minutes, or reset your password.`,
    );
  }

  if (!user.isActive) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'That account has been disabled');
  }

  if (!(await bcrypt.compare(input.password, user.passwordHash))) {
    const { shouldLock, lockedUntil } = lockState(user.failedLoginCount);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: { increment: 1 },
        ...(shouldLock ? { lockedUntil } : {}),
      },
    });
    throw invalid;
  }

  if (user.failedLoginCount > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  const { passwordHash: _hash, isActive: _active, failedLoginCount: _count, lockedUntil: _lock, ...rest } = user;
  return shape(rest);
};

type GoogleProfile = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
};

const upsertGoogleUser = async (profile: GoogleProfile) => {
  const byGoogleId = await prisma.user.findUnique({
    where: { googleId: profile.sub },
    select: { ...publicUser, isActive: true },
  });

  if (byGoogleId) {
    if (!byGoogleId.isActive) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'That account has been disabled');
    }
    const { isActive: _a, ...rest } = byGoogleId;
    return { user: shape(rest), isNew: false };
  }

  const email = profile.email.trim().toLowerCase();
  const byEmail = await prisma.user.findUnique({
    where: { email },
    select: { ...publicUser, isActive: true },
  });

  if (byEmail) {
    if (!profile.email_verified) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'Google has not verified that email address, so we cannot link it to an existing account',
      );
    }
    if (!byEmail.isActive) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'That account has been disabled');
    }

    const linked = await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        googleId: profile.sub,
        emailVerified: true,
        ...(byEmail.avatarUrl ? {} : { avatarUrl: profile.picture ?? null }),
      },
      select: publicUser,
    });

    return { user: shape(linked), isNew: false };
  }

  const name = profile.name?.trim() || email.split('@')[0] || 'Foodie';

  const created = await prisma.user.create({
    data: {
      email,
      name,
      username: await generateUsername(name, email),
      googleId: profile.sub,
      emailVerified: profile.email_verified,
      avatarUrl: profile.picture ?? null,
    },
    select: publicUser,
  });

  return { user: shape(created), isNew: true };
};

const updateProfile = async (
  userId: string,
  input: { name?: string; username?: string; avatarUrl?: string | null },
) => {
  if (input.username) {
    const taken = await prisma.user.findFirst({
      where: { username: input.username, id: { not: userId } },
      select: { id: true },
    });
    if (taken) {
      throw new ApiError(StatusCodes.CONFLICT, 'That username is taken');
    }
  }

  return shape(
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.username === undefined ? {} : { username: input.username }),
        ...(input.avatarUrl === undefined ? {} : { avatarUrl: input.avatarUrl }),
      },
      select: publicUser,
    }),
  );
};

const me = (user: SessionUser) => user;

export const AuthService = {
  register,
  login,
  upsertGoogleUser,
  updateProfile,
  me,
  LOCK_AFTER,
};
