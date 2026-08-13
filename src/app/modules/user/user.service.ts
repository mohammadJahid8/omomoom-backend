import { StatusCodes } from 'http-status-codes';

import ApiError from '../../../errors/ApiError';
import type { Prisma } from '../../../generated/prisma/client';
import { Role } from '../../../generated/prisma/enums';
import prisma from '../../../shared/prisma';
import type { SessionUser } from '../../../shared/session';

import type { ListUsersQuery, UpdateUserBody } from './user.validation';

const rowSelect = {
  id: true,
  email: true,
  username: true,
  name: true,
  role: true,
  isActive: true,
  emailVerified: true,
  avatarUrl: true,
  createdAt: true,
  _count: {
    select: { recommendations: true, saves: true, ownedRestaurants: true },
  },
} as const;

const list = async (query: ListUsersQuery) => {
  const where: Prisma.UserWhereInput = {
    ...(query.role === 'ALL' ? {} : { role: query.role }),
    ...(query.state === 'ALL'
      ? {}
      : { isActive: query.state === 'ACTIVE' }),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
            { username: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: rowSelect,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    data: rows,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      hasNextPage: query.page * query.limit < total,
      hasPrevPage: query.page > 1,
    },
  };
};

/**
 * Guards that stop an admin locking everyone out, including themselves.
 */
async function assertSafeChange(
  actor: SessionUser,
  target: { id: string; role: Role; isActive: boolean },
  input: UpdateUserBody,
): Promise<void> {
  const demoting =
    input.role !== undefined &&
    target.role !== Role.USER &&
    input.role === Role.USER;

  const deactivating = input.isActive === false && target.isActive;

  if (actor.id === target.id) {
    if (demoting) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You cannot remove your own admin access. Ask another admin.',
      );
    }
    if (deactivating) {
      throw new ApiError(
        StatusCodes.FORBIDDEN,
        'You cannot disable your own account',
      );
    }
  }

  if (target.role === Role.SUPER_ADMIN && actor.role !== Role.SUPER_ADMIN) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      'Only a super admin can change another super admin',
    );
  }

  if (input.role === Role.SUPER_ADMIN && actor.role !== Role.SUPER_ADMIN) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      'Only a super admin can promote someone to super admin',
    );
  }

  if (demoting || deactivating) {
    const remaining = await prisma.user.count({
      where: {
        isActive: true,
        role: { in: [Role.ADMIN, Role.SUPER_ADMIN] },
        id: { not: target.id },
      },
    });

    if (remaining === 0) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        'That is the last active admin. Promote someone else first.',
      );
    }
  }
}

const update = async (
  actor: SessionUser,
  id: string,
  input: UpdateUserBody,
) => {
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, isActive: true },
  });

  if (!target) throw new ApiError(StatusCodes.NOT_FOUND, 'Account not found');

  await assertSafeChange(actor, target, input);

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(input.role === undefined ? {} : { role: input.role }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    },
    select: rowSelect,
  });

  // A disabled account keeps its rows but must lose every live session.
  if (input.isActive === false) {
    await prisma.session.deleteMany({ where: { userId: id } });
  }

  return updated;
};

export const UserService = { list, update };
