import fs from 'node:fs';
import path from 'node:path';

import bcrypt from 'bcryptjs';

import config from '../src/config';
import {
  type MichelinRating,
  type PriceTier,
  type RestaurantStatus,
  type TagType,
  Role,
  PhotoRole,
  PhotoSource,
  PhotoStatus,
} from '../src/generated/prisma/enums';
import logger from '../src/shared/logger';
import prisma from '../src/shared/prisma';

type SeedRestaurant = {
  externalRef: string;
  name: string;
  slug: string;
  description: string | null;
  subCuisine: string | null;
  signatureDishes: string | null;
  cuisines: string[];
  neighborhood: string | null;
  municipality: string | null;
  addressLine: string | null;
  phone: string | null;
  websiteUrl: string | null;
  menuUrl: string | null;
  reservationUrl: string | null;
  googleMapsUrl: string | null;
  socials: Record<string, string>;
  priceTier: string | null;
  michelin: string | null;
  hoursText: string | null;
  status: string;
  imageUrl: string | null;
  internalNotes: string | null;
  tags: { type: string; label: string; emoji: string | null }[];
};

const slugify = (input: string): string =>
  input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const CUISINE_CODES: Record<string, string> = {
  American: 'US',
  Argentine: 'AR',
  Brazilian: 'BR',
  British: 'GB',
  Chinese: 'CN',
  Colombian: 'CO',
  Cuban: 'CU',
  Dominican: 'DO',
  Ecuadorian: 'EC',
  Egyptian: 'EG',
  French: 'FR',
  Greek: 'GR',
  Haitian: 'HT',
  Indian: 'IN',
  Israeli: 'IL',
  Italian: 'IT',
  Jamaican: 'JM',
  Japanese: 'JP',
  Korean: 'KR',
  Lebanese: 'LB',
  Mexican: 'MX',
  Moroccan: 'MA',
  Persian: 'IR',
  Peruvian: 'PE',
  Portuguese: 'PT',
  'Puerto Rican': 'PR',
  Spanish: 'ES',
  Thai: 'TH',
  Turkish: 'TR',
  Uruguayan: 'UY',
  Venezuelan: 'VE',
  Vietnamese: 'VN',
};

async function main(): Promise<void> {
  const dataPath = path.join(
    process.cwd(),
    'prisma',
    'seed-data',
    'restaurants.json',
  );
  if (!fs.existsSync(dataPath)) {
    logger.error(
      'Missing prisma/seed-data/restaurants.json. Run: npm run extract:base44 -- "<path to dump.sql>"',
    );
    process.exit(1);
  }

  const data = JSON.parse(
    fs.readFileSync(dataPath, 'utf8'),
  ) as SeedRestaurant[];
  logger.info(`Seeding ${data.length} restaurants`);

  const city = await prisma.city.upsert({
    where: { slug: 'miami' },
    update: {},
    create: {
      name: 'Miami',
      slug: 'miami',
      state: 'FL',
      country: 'US',
      timezone: 'America/New_York',
      isActive: true,
    },
  });

  const areaNames = [
    ...new Set(data.map((r) => r.neighborhood).filter(Boolean)),
  ].sort() as string[];
  const areaByName = new Map<string, string>();

  for (const [index, name] of areaNames.entries()) {
    const area = await prisma.neighborhood.upsert({
      where: { cityId_slug: { cityId: city.id, slug: slugify(name) } },
      update: { name },
      create: { cityId: city.id, name, slug: slugify(name), sortOrder: index },
    });
    areaByName.set(name, area.id);
  }
  logger.info(`  ${areaByName.size} neighborhoods`);

  const tagUsage = new Map<
    string,
    { type: string; label: string; emoji: string | null; uses: number }
  >();
  for (const restaurant of data) {
    for (const tag of restaurant.tags) {
      const key = `${tag.type}::${tag.label}`;
      const existing = tagUsage.get(key);
      if (existing) {
        existing.uses += 1;
        existing.emoji ??= tag.emoji;
      } else {
        tagUsage.set(key, { ...tag, uses: 1 });
      }
    }
  }

  const tagIdByKey = new Map<string, string>();
  const ordered = [...tagUsage.values()].sort(
    (a, b) => a.type.localeCompare(b.type) || b.uses - a.uses,
  );

  for (const [index, tag] of ordered.entries()) {
    const record = await prisma.tag.upsert({
      where: {
        type_slug: { type: tag.type as TagType, slug: slugify(tag.label) },
      },
      update: { name: tag.label, emoji: tag.emoji, sortOrder: index },
      create: {
        type: tag.type as TagType,
        name: tag.label,
        slug: slugify(tag.label),
        emoji: tag.emoji,
        code:
          tag.type === 'CUISINE' ? (CUISINE_CODES[tag.label] ?? null) : null,
        sortOrder: index,
      },
    });
    tagIdByKey.set(`${tag.type}::${tag.label}`, record.id);
  }
  logger.info(`  ${tagIdByKey.size} tags`);

  let created = 0;
  let updated = 0;

  for (const item of data) {
    const existing = await prisma.restaurant.findUnique({
      where: { externalRef: item.externalRef },
      select: { id: true },
    });

    const fields = {
      name: item.name,
      slug: item.slug,
      cityId: city.id,
      neighborhoodId: item.neighborhood
        ? (areaByName.get(item.neighborhood) ?? null)
        : null,
      municipality: item.municipality,
      addressLine: item.addressLine,
      phone: item.phone,
      websiteUrl: item.websiteUrl,
      menuUrl: item.menuUrl,
      reservationUrl: item.reservationUrl,
      googleMapsUrl: item.googleMapsUrl,
      socials: Object.keys(item.socials).length > 0 ? item.socials : undefined,
      description: item.description,
      subCuisine: item.subCuisine,
      signatureDishes: item.signatureDishes,
      hoursText: item.hoursText,
      priceTier: (item.priceTier as PriceTier | null) ?? null,
      michelin: (item.michelin as MichelinRating | null) ?? null,
      status: item.status as RestaurantStatus,
      internalNotes: item.internalNotes,
      externalRef: item.externalRef,
    };

    const restaurant = existing
      ? await prisma.restaurant.update({
          where: { id: existing.id },
          data: fields,
        })
      : await prisma.restaurant.create({ data: fields });

    if (existing) {
      updated++;
    } else {
      created++;
    }

    await prisma.restaurantTag.deleteMany({
      where: { restaurantId: restaurant.id },
    });
    const tagIds = item.tags
      .map((t) => tagIdByKey.get(`${t.type}::${t.label}`))
      .filter((id): id is string => Boolean(id));

    if (tagIds.length > 0) {
      await prisma.restaurantTag.createMany({
        data: tagIds.map((tagId) => ({ restaurantId: restaurant.id, tagId })),
        skipDuplicates: true,
      });
    }

    if (item.imageUrl) {
      const alreadyHasCover = await prisma.restaurantPhoto.findFirst({
        where: { restaurantId: restaurant.id, role: PhotoRole.COVER },
        select: { id: true },
      });

      if (!alreadyHasCover) {
        const photo = await prisma.restaurantPhoto.create({
          data: {
            restaurantId: restaurant.id,
            url: item.imageUrl,
            sourceUrl: item.imageUrl,
            role: PhotoRole.COVER,
            status: PhotoStatus.APPROVED,
            source: PhotoSource.IMPORT,
            sortOrder: 0,
          },
        });
        await prisma.restaurant.update({
          where: { id: restaurant.id },
          data: { coverPhotoId: photo.id },
        });
      }
    }
  }

  logger.info(`  restaurants: ${created} created, ${updated} updated`);

  const passwordHash = await bcrypt.hash(
    'Password123!',
    config.bcryptSaltRounds,
  );
  await prisma.user.upsert({
    where: { email: 'admin@omomoom.dev' },
    update: {},
    create: {
      email: 'admin@omomoom.dev',
      username: 'admin',
      name: 'Omomoom Admin',
      passwordHash,
      role: Role.ADMIN,
      emailVerified: true,
    },
  });

  const [restaurants, published, tags, areas, photos] = await Promise.all([
    prisma.restaurant.count(),
    prisma.restaurant.count({ where: { status: 'PUBLISHED' } }),
    prisma.tag.count(),
    prisma.neighborhood.count(),
    prisma.restaurantPhoto.count(),
  ]);

  logger.info(
    {
      restaurants,
      published,
      drafts: restaurants - published,
      tags,
      neighborhoods: areas,
      photos,
    },
    '🌱 Seed complete. Admin login: admin@omomoom.dev / Password123!',
  );
}

main()
  .catch((error: unknown) => {
    logger.error({ err: error }, 'Seeding failed');
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
