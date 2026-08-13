import { StatusCodes } from 'http-status-codes';

import ApiError from '../../../errors/ApiError';
import type { Prisma } from '../../../generated/prisma/client';
import { RestaurantStatus } from '../../../generated/prisma/enums';
import prisma from '../../../shared/prisma';

import type {
  AdminRestaurantBody,
  AdminRestaurantPatch,
  AdminRestaurantQuery,
} from './restaurant.admin.validation';

const rowSelect = {
  id: true,
  slug: true,
  name: true,
  status: true,
  claimState: true,
  municipality: true,
  priceTier: true,
  michelin: true,
  ratingAverage: true,
  reviewCount: true,
  neighborhood: { select: { id: true, name: true } },
  coverPhoto: { select: { url: true } },
  updatedAt: true,
} as const;

const editSelect = {
  ...rowSelect,
  description: true,
  subCuisine: true,
  signatureDishes: true,
  addressLine: true,
  phone: true,
  websiteUrl: true,
  menuUrl: true,
  reservationUrl: true,
  hoursText: true,
  neighborhoodId: true,
  _count: { select: { recommendations: true, savedBy: true, events: true } },
} as const;

const slugify = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'restaurant';

async function uniqueSlug(
  name: string,
  cityId: string,
  ignoreId?: string,
): Promise<string> {
  const base = slugify(name);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await prisma.restaurant.findFirst({
      where: { cityId, slug, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
      select: { id: true },
    });
    if (!clash) return slug;
  }

  return `${base}-${Date.now().toString(36)}`;
}

const blank = (value: unknown): string | null =>
  value === '' || value === undefined || value === null
    ? null
    : (value as string);

type WritableFields = Partial<
  Pick<
    Prisma.RestaurantUncheckedCreateInput,
    | 'name'
    | 'status'
    | 'description'
    | 'subCuisine'
    | 'signatureDishes'
    | 'municipality'
    | 'addressLine'
    | 'phone'
    | 'websiteUrl'
    | 'menuUrl'
    | 'reservationUrl'
    | 'hoursText'
    | 'neighborhoodId'
    | 'priceTier'
    | 'michelin'
  >
>;

/** Only the keys actually present survive, so a PATCH never blanks a field. */
function writable(input: AdminRestaurantPatch): WritableFields {
  const data: WritableFields = {};

  const text = [
    'description',
    'subCuisine',
    'signatureDishes',
    'municipality',
    'addressLine',
    'phone',
    'websiteUrl',
    'menuUrl',
    'reservationUrl',
    'hoursText',
    'neighborhoodId',
  ] as const;

  for (const key of text) {
    if (input[key] !== undefined) data[key] = blank(input[key]);
  }

  if (input.name !== undefined) data.name = input.name;
  if (input.status !== undefined) data.status = input.status;
  if (input.priceTier !== undefined) {
    data.priceTier = blank(input.priceTier) as never;
  }
  if (input.michelin !== undefined) {
    data.michelin = blank(input.michelin) as never;
  }

  return data;
}

const list = async (query: AdminRestaurantQuery) => {
  const where: Prisma.RestaurantWhereInput = {
    ...(query.status === 'ALL' ? {} : { status: query.status }),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { municipality: { contains: query.q, mode: 'insensitive' } },
            { subCuisine: { contains: query.q, mode: 'insensitive' } },
            {
              neighborhood: {
                name: { contains: query.q, mode: 'insensitive' },
              },
            },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.restaurant.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: rowSelect,
    }),
    prisma.restaurant.count({ where }),
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

const getById = async (id: string) => {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id },
    select: editSelect,
  });

  if (!restaurant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  return restaurant;
};

const create = async (input: AdminRestaurantBody) => {
  const city = await prisma.city.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (!city) {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      'No city is configured yet, so a restaurant cannot be created',
    );
  }

  return prisma.restaurant.create({
    data: {
      cityId: city.id,
      name: input.name,
      slug: await uniqueSlug(input.name, city.id),
      status: input.status ?? RestaurantStatus.DRAFT,
      ...writable(input),
    },
    select: editSelect,
  });
};

const update = async (id: string, input: AdminRestaurantPatch) => {
  const existing = await prisma.restaurant.findUnique({
    where: { id },
    select: { id: true, cityId: true, name: true },
  });

  if (!existing) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  const renamed = input.name !== undefined && input.name !== existing.name;

  return prisma.restaurant.update({
    where: { id },
    data: {
      ...writable(input),
      ...(renamed
        ? { slug: await uniqueSlug(input.name as string, existing.cityId, id) }
        : {}),
    },
    select: editSelect,
  });
};

const remove = async (id: string) => {
  const existing = await prisma.restaurant.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  // Cover and logo point at photos that cascade from the restaurant, so the
  // link has to go first or Postgres refuses the delete.
  await prisma.restaurant.update({
    where: { id },
    data: { coverPhotoId: null, logoId: null },
  });

  await prisma.restaurant.delete({ where: { id } });
};

export const RestaurantAdminService = {
  list,
  getById,
  create,
  update,
  remove,
};
