import { StatusCodes } from 'http-status-codes';

import ApiError from '../../../errors/ApiError';
import {
  PhotoRole,
  PhotoSource,
  PhotoStatus,
} from '../../../generated/prisma/enums';
import prisma from '../../../shared/prisma';
import type { SessionUser } from '../../../shared/session';
import { describeObject, publicUrlFor, removeObject } from '../../../shared/storage';

import type { PhotoBody, PhotoOrderBody, PhotoPatchBody } from './studio.validation';
import { assertPaid } from './studio.service';

/** Enough for a rich page, few enough that the gallery stays quick to load. */
export const MAX_PHOTOS = 24;

const photoSelect = {
  id: true,
  url: true,
  storageKey: true,
  caption: true,
  width: true,
  height: true,
  role: true,
  sortOrder: true,
  createdAt: true,
} as const;

const list = async (restaurantId: string) => {
  const [photos, restaurant] = await Promise.all([
    prisma.restaurantPhoto.findMany({
      where: { restaurantId, status: PhotoStatus.APPROVED },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: photoSelect,
    }),
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { coverPhotoId: true },
    }),
  ]);

  return {
    photos: photos.map((photo) => ({
      ...photo,
      isCover: photo.id === restaurant?.coverPhotoId,
    })),
    max: MAX_PHOTOS,
  };
};

/**
 * The key came from the browser, so none of it is trusted: it has to sit under
 * this restaurant's own prefix, the object has to actually exist, and it must
 * not already be attached to something. Otherwise a key could be guessed,
 * borrowed from another listing, or committed twice.
 */
const add = async (
  user: SessionUser,
  restaurantId: string,
  input: PhotoBody,
) => {
  await assertPaid(restaurantId);

  if (!input.key.startsWith(`restaurants/${restaurantId}/`)) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'That upload is not yours');
  }

  const [count, duplicate] = await Promise.all([
    prisma.restaurantPhoto.count({ where: { restaurantId } }),
    prisma.restaurantPhoto.findFirst({
      where: { storageKey: input.key },
      select: { id: true },
    }),
  ]);

  if (duplicate) {
    throw new ApiError(StatusCodes.CONFLICT, 'That photo was already added');
  }

  if (count >= MAX_PHOTOS) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      `You can have up to ${MAX_PHOTOS} photos. Remove one first.`,
    );
  }

  if (!(await describeObject(input.key))) {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      'That upload did not finish. Try again.',
    );
  }

  const last = await prisma.restaurantPhoto.findFirst({
    where: { restaurantId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  const photo = await prisma.restaurantPhoto.create({
    data: {
      restaurantId,
      storageKey: input.key,
      url: publicUrlFor(input.key),
      caption: input.caption || null,
      width: input.width ?? null,
      height: input.height ?? null,
      role: PhotoRole.GALLERY,
      // A verified, paying owner is accountable for what they publish, so
      // their photos go live the way their hours do. Guest photos, when they
      // arrive, are the ones that need a queue.
      status: PhotoStatus.APPROVED,
      source: PhotoSource.OWNER,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      uploadedById: user.id,
    },
    select: photoSelect,
  });

  // The first photo anyone adds becomes the cover, so a listing is never left
  // with a gallery full of pictures and a blank card.
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { coverPhotoId: true },
  });

  if (!restaurant?.coverPhotoId) {
    await setCover(restaurantId, photo.id);
    return { ...photo, isCover: true };
  }

  return { ...photo, isCover: false };
};

async function owned(restaurantId: string, photoId: string) {
  const photo = await prisma.restaurantPhoto.findUnique({
    where: { id: photoId },
    select: { id: true, restaurantId: true, storageKey: true },
  });

  if (!photo || photo.restaurantId !== restaurantId) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Photo not found');
  }

  return photo;
}

async function setCover(restaurantId: string, photoId: string) {
  const previous = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { coverPhotoId: true },
  });

  await prisma.$transaction([
    ...(previous?.coverPhotoId && previous.coverPhotoId !== photoId
      ? [
          prisma.restaurantPhoto.update({
            where: { id: previous.coverPhotoId },
            data: { role: PhotoRole.GALLERY },
          }),
        ]
      : []),
    prisma.restaurantPhoto.update({
      where: { id: photoId },
      data: { role: PhotoRole.COVER },
    }),
    prisma.restaurant.update({
      where: { id: restaurantId },
      data: { coverPhotoId: photoId },
    }),
  ]);
}

const update = async (
  restaurantId: string,
  photoId: string,
  input: PhotoPatchBody,
) => {
  await assertPaid(restaurantId);
  await owned(restaurantId, photoId);

  if (input.caption !== undefined) {
    await prisma.restaurantPhoto.update({
      where: { id: photoId },
      data: { caption: input.caption || null },
    });
  }

  if (input.isCover) await setCover(restaurantId, photoId);

  return list(restaurantId);
};

/**
 * The row and the file go together. Unsetting the cover first matters: the
 * restaurant holds a foreign key to it, and deleting the row underneath that
 * would fail.
 */
const remove = async (restaurantId: string, photoId: string) => {
  await assertPaid(restaurantId);
  const photo = await owned(restaurantId, photoId);

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { coverPhotoId: true },
  });

  if (restaurant?.coverPhotoId === photoId) {
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { coverPhotoId: null },
    });
  }

  await prisma.restaurantPhoto.delete({ where: { id: photoId } });

  if (photo.storageKey) await removeObject(photo.storageKey);

  // Losing the cover should not leave the listing without one.
  if (restaurant?.coverPhotoId === photoId) {
    const next = await prisma.restaurantPhoto.findFirst({
      where: { restaurantId, status: PhotoStatus.APPROVED },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    if (next) await setCover(restaurantId, next.id);
  }

  return list(restaurantId);
};

const reorder = async (restaurantId: string, input: PhotoOrderBody) => {
  await assertPaid(restaurantId);

  const mine = await prisma.restaurantPhoto.findMany({
    where: { restaurantId },
    select: { id: true },
  });

  const known = new Set(mine.map((photo) => photo.id));

  if (
    input.ids.length !== known.size ||
    input.ids.some((id) => !known.has(id))
  ) {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      'That ordering does not match this restaurant',
    );
  }

  await prisma.$transaction(
    input.ids.map((id, index) =>
      prisma.restaurantPhoto.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );

  return list(restaurantId);
};

export const StudioPhotoService = { list, add, update, remove, reorder };
