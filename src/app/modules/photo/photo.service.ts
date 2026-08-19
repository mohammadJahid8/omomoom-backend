import { StatusCodes } from 'http-status-codes';

import ApiError from '../../../errors/ApiError';
import { PhotoSource, PhotoStatus } from '../../../generated/prisma/enums';
import prisma from '../../../shared/prisma';
import type { SessionUser } from '../../../shared/session';
import { removeObject } from '../../../shared/storage';

import type { DecideBody, QueueQuery } from './photo.validation';

const rowSelect = {
  recommendationId: true,
  id: true,
  url: true,
  caption: true,
  width: true,
  height: true,
  status: true,
  createdAt: true,
  restaurant: { select: { id: true, slug: true, name: true } },
} as const;

const queueSelect = {
  ...rowSelect,
  storageKey: true,
  uploadedBy: {
    select: { id: true, name: true, username: true, createdAt: true },
  },
} as const;

const mine = async (userId: string) => {
  const photos = await prisma.restaurantPhoto.findMany({
    where: { uploadedById: userId, source: PhotoSource.USER },
    orderBy: { createdAt: 'desc' },
    select: rowSelect,
  });

  return { photos };
};

/** Yours to take back, whether or not anyone has looked at it yet. */
const withdraw = async (userId: string, photoId: string) => {
  const photo = await prisma.restaurantPhoto.findUnique({
    where: { id: photoId },
    select: { id: true, uploadedById: true, storageKey: true },
  });

  if (!photo || photo.uploadedById !== userId) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Photo not found');
  }

  await prisma.restaurantPhoto.delete({ where: { id: photoId } });
  if (photo.storageKey) await removeObject(photo.storageKey);

  return mine(userId);
};

const queue = async (query: QueueQuery) => {
  const where = {
    source: PhotoSource.USER,
    status: query.status as PhotoStatus,
  };

  const [rows, total, pending] = await Promise.all([
    prisma.restaurantPhoto.findMany({
      where,
      // Oldest first: nobody should be waiting longest and looked at last.
      orderBy: { createdAt: 'asc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: queueSelect,
    }),
    prisma.restaurantPhoto.count({ where }),
    prisma.restaurantPhoto.count({
      where: { source: PhotoSource.USER, status: PhotoStatus.PENDING },
    }),
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
      pending,
    },
  };
};

/**
 * Rejecting deletes the file as well as hiding the row. Keeping a copy of
 * something we have just judged unacceptable serves nobody, and the record of
 * the decision survives in the row itself.
 */
const decide = async (
  actor: SessionUser,
  photoId: string,
  input: DecideBody,
) => {
  const photo = await prisma.restaurantPhoto.findUnique({
    where: { id: photoId },
    select: { id: true, status: true, storageKey: true, source: true },
  });

  if (!photo || photo.source !== PhotoSource.USER) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Photo not found');
  }

  if (photo.status !== PhotoStatus.PENDING) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'Someone has already looked at this one',
    );
  }

  if (input.action === 'REJECT') {
    await prisma.restaurantPhoto.update({
      where: { id: photoId },
      data: { status: PhotoStatus.REJECTED, storageKey: null },
    });

    if (photo.storageKey) await removeObject(photo.storageKey);

    return { id: photoId, status: PhotoStatus.REJECTED, by: actor.id };
  }

  await prisma.restaurantPhoto.update({
    where: { id: photoId },
    data: { status: PhotoStatus.APPROVED },
  });

  return { id: photoId, status: PhotoStatus.APPROVED, by: actor.id };
};

export const PhotoService = { mine, withdraw, queue, decide };
