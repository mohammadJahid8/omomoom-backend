import { StatusCodes } from 'http-status-codes';

import ApiError from '../../../errors/ApiError';
import { type Prisma } from '../../../generated/prisma/client';
import {
  type MichelinRating,
  PhotoStatus,
  type PriceTier,
  RestaurantStatus,
  TagType,
} from '../../../generated/prisma/enums';
import { paginationHelpers } from '../../../helpers/paginationHelper';
import type { IPaginatedResult } from '../../../interfaces/common';
import prisma from '../../../shared/prisma';

import type { RestaurantSort } from './restaurant.constant';
import type {
  FacetOption,
  RestaurantFacets,
  RestaurantFilters,
} from './restaurant.interface';

export const cardSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  subCuisine: true,
  signatureDishes: true,
  hoursText: true,
  priceTier: true,
  michelin: true,
  claimState: true,
  ratingAverage: true,
  reviewCount: true,
  municipality: true,
  neighborhood: { select: { name: true, slug: true } },
  coverPhoto: { select: { url: true, blurhash: true } },
  tags: {
    where: { tag: { type: TagType.CUISINE } },
    select: { tag: { select: { name: true, slug: true, code: true } } },

    take: 3,
  },
} satisfies Prisma.RestaurantSelect;

const detailSelect = {
  ...cardSelect,
  addressLine: true,
  postalCode: true,
  latitude: true,
  longitude: true,
  googleMapsUrl: true,
  phone: true,
  email: true,
  websiteUrl: true,
  menuUrl: true,
  reservationUrl: true,
  socials: true,
  story: true,
  whatMakesSpecial: true,
  chefStory: true,
  yearEstablished: true,
  createdAt: true,
  updatedAt: true,
  city: { select: { name: true, slug: true, timezone: true } },
  hours: {
    select: { dayOfWeek: true, opensAt: true, closesAt: true, label: true },
    orderBy: [{ dayOfWeek: 'asc' }, { opensAt: 'asc' }],
  },

  photos: {
    where: { status: PhotoStatus.APPROVED },
    select: { id: true, url: true, blurhash: true, caption: true, role: true },
    // Community photos all share one sort value, so the tiebreak decides them.
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
  tags: {
    select: {
      tag: {
        select: { type: true, name: true, slug: true, emoji: true, code: true },
      },
    },
  },
} satisfies Prisma.RestaurantSelect;

type CardRow = Prisma.RestaurantGetPayload<{ select: typeof cardSelect }>;
type DetailRow = Prisma.RestaurantGetPayload<{ select: typeof detailSelect }>;

type FacetGroup =
  'cuisine' | 'area' | 'price' | 'dish' | 'occasion' | 'dietary';

const tagCondition = (
  type: TagType,
  slugs: string[],
): Prisma.RestaurantWhereInput => ({
  tags: { some: { tag: { type, slug: { in: slugs } } } },
});

export const buildWhere = (
  filters: RestaurantFilters,
  exclude?: FacetGroup,
): Prisma.RestaurantWhereInput => {
  const and: Prisma.RestaurantWhereInput[] = [];

  const q = filters.q?.trim();
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { signatureDishes: { contains: q, mode: 'insensitive' } },
        { subCuisine: { contains: q, mode: 'insensitive' } },
        { municipality: { contains: q, mode: 'insensitive' } },
        { neighborhood: { name: { contains: q, mode: 'insensitive' } } },
        {
          tags: {
            some: { tag: { name: { contains: q, mode: 'insensitive' } } },
          },
        },
      ],
    });
  }

  if (exclude !== 'cuisine' && filters.cuisine?.length) {
    and.push(tagCondition(TagType.CUISINE, filters.cuisine));
  }
  if (exclude !== 'dish' && filters.dish?.length) {
    and.push(tagCondition(TagType.DISH, filters.dish));
  }
  if (exclude !== 'occasion' && filters.occasion?.length) {
    and.push(tagCondition(TagType.OCCASION, filters.occasion));
  }
  if (exclude !== 'dietary' && filters.dietary?.length) {
    and.push(tagCondition(TagType.DIETARY, filters.dietary));
  }
  if (filters.feature?.length) {
    and.push(tagCondition(TagType.FEATURE, filters.feature));
  }

  if (exclude !== 'area' && filters.area?.length) {
    and.push({ neighborhood: { slug: { in: filters.area } } });
  }
  if (exclude !== 'price' && filters.price?.length) {
    and.push({ priceTier: { in: filters.price as PriceTier[] } });
  }
  if (filters.michelin?.length) {
    and.push({ michelin: { in: filters.michelin as MichelinRating[] } });
  }
  if (filters.claimed !== undefined) {
    and.push({ claimState: filters.claimed ? 'CLAIMED' : { not: 'CLAIMED' } });
  }

  return {
    status: RestaurantStatus.PUBLISHED,
    ...(and.length > 0 ? { AND: and } : {}),
  };
};

const buildOrderBy = (
  sort: RestaurantSort,
): Prisma.RestaurantOrderByWithRelationInput[] => {
  switch (sort) {
    case 'rating':
      return [
        { ratingAverage: 'desc' },
        { reviewCount: 'desc' },
        { id: 'asc' },
      ];
    case 'newest':
      return [{ createdAt: 'desc' }, { id: 'asc' }];
    case 'name':
      return [{ name: 'asc' }, { id: 'asc' }];
    case 'featured':
    default:
      return [
        { michelin: { sort: 'asc', nulls: 'last' } },
        { ratingAverage: 'desc' },
        { name: 'asc' },
        { id: 'asc' },
      ];
  }
};

export const shapeCard = (row: CardRow) => {
  const { tags, neighborhood, coverPhoto, ...rest } = row;
  const cuisines = tags.map((t) => t.tag);

  return {
    ...rest,

    cuisine: cuisines[0]?.name ?? null,
    cuisines,
    neighborhood: neighborhood?.name ?? null,
    neighborhoodSlug: neighborhood?.slug ?? null,
    imageUrl: coverPhoto?.url ?? null,
    imageBlurhash: coverPhoto?.blurhash ?? null,
    signatureDishes: rest.signatureDishes
      ? rest.signatureDishes
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean)
      : [],
  };
};

const shapeDetail = (row: DetailRow) => {
  const { tags, neighborhood, coverPhoto, photos, ...rest } = row;

  const groupedTags: Record<
    string,
    { name: string; slug: string; emoji: string | null }[]
  > = {};
  for (const { tag } of tags) {
    (groupedTags[tag.type] ??= []).push({
      name: tag.name,
      slug: tag.slug,
      emoji: tag.emoji,
    });
  }

  return {
    ...rest,
    cuisine: groupedTags.CUISINE?.[0]?.name ?? null,
    neighborhood: neighborhood?.name ?? null,
    neighborhoodSlug: neighborhood?.slug ?? null,
    imageUrl: coverPhoto?.url ?? null,
    imageBlurhash: coverPhoto?.blurhash ?? null,
    photos,
    tags: groupedTags,
    signatureDishes: rest.signatureDishes
      ? rest.signatureDishes
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean)
      : [],
  };
};

const PRICE_LABEL: Record<PriceTier, string> = {
  ONE: '$',
  TWO: '$$',
  THREE: '$$$',
  FOUR: '$$$$',
};

const tagFacet = async (
  type: TagType,
  filters: RestaurantFilters,
  group: FacetGroup,
): Promise<FacetOption[]> => {
  const rows = await prisma.tag.findMany({
    where: { type, isActive: true },
    select: {
      name: true,
      slug: true,
      emoji: true,
      code: true,
      _count: {
        select: {
          restaurants: { where: { restaurant: buildWhere(filters, group) } },
        },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  return rows
    .map((row) => ({
      slug: row.slug,
      label: row.name,
      emoji: row.emoji,
      code: row.code,
      count: row._count.restaurants,
    }))
    .filter(
      (option) => option.count > 0 || isSelected(filters, group, option.slug),
    )
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

const isSelected = (
  filters: RestaurantFilters,
  group: FacetGroup,
  slug: string,
): boolean => {
  const selected = filters[group as keyof RestaurantFilters];
  return Array.isArray(selected) && (selected as string[]).includes(slug);
};

const buildFacets = async (
  filters: RestaurantFilters,
): Promise<RestaurantFacets> => {
  const [cuisine, dish, occasion, dietary, areaRows, priceRows] =
    await Promise.all([
      tagFacet(TagType.CUISINE, filters, 'cuisine'),
      tagFacet(TagType.DISH, filters, 'dish'),
      tagFacet(TagType.OCCASION, filters, 'occasion'),
      tagFacet(TagType.DIETARY, filters, 'dietary'),

      prisma.neighborhood.findMany({
        where: { isActive: true },
        select: {
          name: true,
          slug: true,
          _count: {
            select: { restaurants: { where: buildWhere(filters, 'area') } },
          },
        },
      }),

      prisma.restaurant.groupBy({
        by: ['priceTier'],
        where: buildWhere(filters, 'price'),
        _count: { _all: true },
      }),
    ]);

  const area = areaRows
    .map((row) => ({
      slug: row.slug,
      label: row.name,
      count: row._count.restaurants,
    }))
    .filter(
      (option) => option.count > 0 || isSelected(filters, 'area', option.slug),
    )
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const priceCounts = new Map(
    priceRows
      .filter((row) => row.priceTier !== null)
      .map((row) => [row.priceTier as PriceTier, row._count._all]),
  );

  const price = (Object.keys(PRICE_LABEL) as PriceTier[]).map((tier) => ({
    slug: tier,
    label: PRICE_LABEL[tier],
    count: priceCounts.get(tier) ?? 0,
  }));

  return { cuisine, area, price, dish, occasion, dietary };
};

type ListOptions = {
  page?: number;
  limit?: number;
  sortBy?: RestaurantSort;
  facets?: boolean;
};

const getRestaurants = async (
  filters: RestaurantFilters,
  options: ListOptions,
): Promise<
  IPaginatedResult<ReturnType<typeof shapeCard>> & { facets?: RestaurantFacets }
> => {
  const { page, limit, skip } = paginationHelpers.calculatePagination({
    page: options.page,
    limit: options.limit,
  });

  const where = buildWhere(filters);
  const orderBy = buildOrderBy(options.sortBy ?? 'featured');
  const wantsFacets = options.facets !== false;

  const [rows, total, facets] = await Promise.all([
    prisma.restaurant.findMany({
      where,
      select: cardSelect,
      orderBy,
      skip,
      take: limit,

      relationLoadStrategy: 'join',
    }),
    prisma.restaurant.count({ where }),
    wantsFacets ? buildFacets(filters) : Promise.resolve(undefined),
  ]);

  const result = paginationHelpers.paginate(
    rows.map(shapeCard),
    page,
    limit,
    total,
  );
  return wantsFacets ? { ...result, facets } : result;
};

const getRestaurantBySlug = async (slug: string) => {
  const restaurant = await prisma.restaurant.findFirst({
    where: { slug, status: RestaurantStatus.PUBLISHED },
    select: detailSelect,
    relationLoadStrategy: 'join',
  });

  if (!restaurant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  return shapeDetail(restaurant);
};

const getRelatedRestaurants = async (slug: string, take = 6) => {
  const base = await prisma.restaurant.findFirst({
    where: { slug, status: RestaurantStatus.PUBLISHED },
    select: {
      id: true,
      neighborhoodId: true,
      tags: {
        where: { tag: { type: TagType.CUISINE } },
        select: { tagId: true },
      },
    },
  });

  if (!base) throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');

  const cuisineTagIds = base.tags.map((t) => t.tagId);

  const rows = await prisma.restaurant.findMany({
    where: {
      status: RestaurantStatus.PUBLISHED,
      id: { not: base.id },
      OR: [
        ...(base.neighborhoodId
          ? [{ neighborhoodId: base.neighborhoodId }]
          : []),
        ...(cuisineTagIds.length > 0
          ? [{ tags: { some: { tagId: { in: cuisineTagIds } } } }]
          : []),
      ],
    },
    select: cardSelect,
    orderBy: buildOrderBy('featured'),
    take,
    relationLoadStrategy: 'join',
  });

  return rows.map(shapeCard);
};

export const RestaurantService = {
  getRestaurants,
  getRestaurantBySlug,
  getRelatedRestaurants,
};
