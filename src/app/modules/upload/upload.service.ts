import { StatusCodes } from 'http-status-codes';

import ApiError from '../../../errors/ApiError';
import { RestaurantStatus } from '../../../generated/prisma/enums';
import prisma from '../../../shared/prisma';
import type { SessionUser } from '../../../shared/session';
import {
  buildKey,
  presignUpload,
  publicUrlFor,
  storageEnabled,
} from '../../../shared/storage';
import { isAdmin } from '../../middlewares/auth';

import type { SignBody } from './upload.validation';

const MB = 1024 * 1024;

/** One ceiling for every image on the site, whatever it is a picture of. */
export const MAX_IMAGE_BYTES = 3 * MB;

type Context = { user: SessionUser; restaurantId?: string };

/**
 * Every kind of upload the site allows, in one table. Adding a new one is an
 * entry here plus the route that records the key, never another signing
 * endpoint. `authorise` runs before anything is signed, so a URL is only ever
 * handed to someone entitled to write at that path.
 */
const PURPOSES = {
  AVATAR: {
    maxBytes: MAX_IMAGE_BYTES,
    prefix: (ctx: Context) => `avatars/${ctx.user.id}`,
    authorise: async () => {},
  },
  RESTAURANT_PHOTO: {
    maxBytes: MAX_IMAGE_BYTES,
    prefix: (ctx: Context) => `restaurants/${ctx.restaurantId}`,
    authorise: async (ctx: Context) => {
      if (!ctx.restaurantId) {
        throw new ApiError(
          StatusCodes.BAD_REQUEST,
          'Which restaurant is this for?',
        );
      }

      if (
        !isAdmin(ctx.user.role) &&
        !ctx.user.ownedRestaurantIds.includes(ctx.restaurantId)
      ) {
        throw new ApiError(
          StatusCodes.FORBIDDEN,
          'You do not manage that restaurant',
        );
      }

      const restaurant = await prisma.restaurant.findUnique({
        where: { id: ctx.restaurantId },
        select: { id: true },
      });

      if (!restaurant) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
      }
    },
  },
  USER_PHOTO: {
    maxBytes: MAX_IMAGE_BYTES,
    prefix: (ctx: Context) => `community/${ctx.restaurantId}`,
    authorise: async (ctx: Context) => {
      // Anyone signed in may offer a photo of a listing anyone can see. What
      // stops abuse is that it waits for a person, not who is allowed to try.
      const restaurant = await prisma.restaurant.findFirst({
        where: { id: ctx.restaurantId, status: RestaurantStatus.PUBLISHED },
        select: { id: true },
      });

      if (!restaurant) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
      }
    },
  },
} as const;

export type UploadPurpose = keyof typeof PURPOSES;

/** The prefix a key must sit under to be accepted from this caller later. */
export const prefixFor = (purpose: UploadPurpose, ctx: Context) =>
  PURPOSES[purpose].prefix(ctx);

const sign = async (user: SessionUser, input: SignBody) => {
  if (!storageEnabled) {
    throw new ApiError(
      StatusCodes.SERVICE_UNAVAILABLE,
      'Photo uploads are not switched on yet',
    );
  }

  const purpose = input.purpose as UploadPurpose;
  const rule = PURPOSES[purpose];
  const context: Context = { user, restaurantId: input.restaurantId };

  await rule.authorise(context);

  if (input.size > rule.maxBytes) {
    throw new ApiError(
      StatusCodes.REQUEST_TOO_LONG,
      `That image is too large. The limit is ${Math.round(rule.maxBytes / MB)}MB.`,
    );
  }

  const key = buildKey(rule.prefix(context), input.contentType);

  return {
    key,
    uploadUrl: await presignUpload({
      key,
      contentType: input.contentType,
      size: input.size,
    }),
    publicUrl: publicUrlFor(key),
    /**
     * Content-Length is signed as well, but a browser refuses to let script
     * set it and fills it in from the body instead. That works in our favour:
     * the value cannot be faked, so the size limit holds even though only one
     * header is handed back here.
     */
    headers: { 'Content-Type': input.contentType },
  };
};

export const UploadService = { sign };
