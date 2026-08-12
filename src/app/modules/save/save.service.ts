import { StatusCodes } from 'http-status-codes';

import ApiError from '../../../errors/ApiError';
import { RestaurantStatus } from '../../../generated/prisma/enums';
import prisma from '../../../shared/prisma';
import { cardSelect, shapeCard } from '../restaurant/restaurant.service';


async function requireRestaurant(restaurantId: string) {
  const restaurant = await prisma.restaurant.findFirst({
    where: { id: restaurantId, status: RestaurantStatus.PUBLISHED },
    select: { id: true },
  });

  if (!restaurant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }
}

const save = async (userId: string, restaurantId: string) => {
  await requireRestaurant(restaurantId);

  await prisma.savedRestaurant.upsert({
    where: { userId_restaurantId: { userId, restaurantId } },
    create: { userId, restaurantId },
    update: {},
  });

  return { restaurantId, saved: true };
};

const unsave = async (userId: string, restaurantId: string) => {
  await prisma.savedRestaurant.deleteMany({ where: { userId, restaurantId } });
  return { restaurantId, saved: false };
};

const listMine = async (userId: string) => {
  const rows = await prisma.savedRestaurant.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, restaurant: { select: cardSelect } },
  });

  return rows.map((row) => ({
    ...shapeCard(row.restaurant),
    savedAt: row.createdAt,
  }));
};

/**
 * Which of these has the viewer saved? One query for a whole grid, so cards
 * never fan out into a request each.
 */
const savedIdsAmong = async (
  userId: string,
  restaurantIds: string[],
): Promise<string[]> => {
  if (restaurantIds.length === 0) return [];

  const rows = await prisma.savedRestaurant.findMany({
    where: { userId, restaurantId: { in: restaurantIds } },
    select: { restaurantId: true },
  });

  return rows.map((row) => row.restaurantId);
};

const allSavedIds = async (userId: string): Promise<string[]> => {
  const rows = await prisma.savedRestaurant.findMany({
    where: { userId },
    select: { restaurantId: true },
  });

  return rows.map((row) => row.restaurantId);
};

export const SaveService = {
  save,
  unsave,
  listMine,
  savedIdsAmong,
  allSavedIds,
};
