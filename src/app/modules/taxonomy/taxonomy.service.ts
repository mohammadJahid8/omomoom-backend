import { type Prisma } from '../../../generated/prisma/client';
import {
  RestaurantStatus,
  type TagType,
} from '../../../generated/prisma/enums';
import prisma from '../../../shared/prisma';

const publishedOnly: Prisma.RestaurantWhereInput = {
  status: RestaurantStatus.PUBLISHED,
};

const getTags = async (type?: TagType) => {
  const rows = await prisma.tag.findMany({
    where: { isActive: true, ...(type ? { type } : {}) },
    select: {
      type: true,
      name: true,
      slug: true,
      emoji: true,
      code: true,
      _count: {
        select: { restaurants: { where: { restaurant: publishedOnly } } },
      },
    },
    orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
  });

  const options = rows
    .map((row) => ({
      type: row.type,
      slug: row.slug,
      label: row.name,
      emoji: row.emoji,
      code: row.code,
      count: row._count.restaurants,
    }))
    .filter((option) => option.count > 0);

  if (type) return options;

  const grouped: Record<string, typeof options> = {};
  for (const option of options) {
    (grouped[option.type] ??= []).push(option);
  }
  return grouped;
};

const getNeighborhoods = async () => {
  const rows = await prisma.neighborhood.findMany({
    where: { isActive: true },
    select: {
      name: true,
      slug: true,
      city: { select: { name: true, slug: true } },
      _count: { select: { restaurants: { where: publishedOnly } } },
    },
    orderBy: { name: 'asc' },
  });

  return rows
    .map((row) => ({
      slug: row.slug,
      label: row.name,
      city: row.city.name,
      citySlug: row.city.slug,
      count: row._count.restaurants,
    }))
    .filter((option) => option.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

const getCities = async () => {
  const rows = await prisma.city.findMany({
    where: { isActive: true },
    select: {
      name: true,
      slug: true,
      state: true,
      timezone: true,
      _count: { select: { restaurants: { where: publishedOnly } } },
    },
    orderBy: { name: 'asc' },
  });

  return rows.map((row) => ({
    slug: row.slug,
    label: row.name,
    state: row.state,
    timezone: row.timezone,
    count: row._count.restaurants,
  }));
};

export const TaxonomyService = {
  getTags,
  getNeighborhoods,
  getCities,
};
