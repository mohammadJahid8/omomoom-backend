process.env['LOG_LEVEL'] ??= 'warn';

import { TagType } from '../src/generated/prisma/enums';
import prisma from '../src/shared/prisma';

const FLAG = /[\u{1F1E6}-\u{1F1FF}]{2}/u;

async function main(): Promise<void> {
  const dishes = await prisma.tag.findMany({
    where: { type: TagType.DISH, emoji: { not: null } },
    select: { id: true, slug: true, name: true, emoji: true },
  });

  const misfiled = dishes.filter((tag) => FLAG.test(tag.emoji ?? ''));

  if (misfiled.length === 0) {
    console.log('Nothing to fix.');
    return;
  }

  console.log(`Found ${misfiled.length} cuisines filed as dishes.\n`);

  let merged = 0;
  let retyped = 0;
  let moved = 0;

  for (const tag of misfiled) {
    const existing = await prisma.tag.findUnique({
      where: { type_slug: { type: TagType.CUISINE, slug: tag.slug } },
      select: { id: true },
    });

    if (!existing) {
      await prisma.tag.update({
        where: { id: tag.id },
        data: { type: TagType.CUISINE },
      });
      retyped += 1;
      console.log(`  retyped  ${tag.emoji} ${tag.name}`);
      continue;
    }

    const links = await prisma.restaurantTag.findMany({
      where: { tagId: tag.id },
      select: { restaurantId: true },
    });

    const already = await prisma.restaurantTag.findMany({
      where: {
        tagId: existing.id,
        restaurantId: { in: links.map((l) => l.restaurantId) },
      },
      select: { restaurantId: true },
    });
    const have = new Set(already.map((l) => l.restaurantId));

    const toCreate = links
      .filter((l) => !have.has(l.restaurantId))
      .map((l) => ({ restaurantId: l.restaurantId, tagId: existing.id }));

    if (toCreate.length > 0) {
      await prisma.restaurantTag.createMany({ data: toCreate });
    }

    await prisma.tag.delete({ where: { id: tag.id } });
    merged += 1;
    moved += toCreate.length;
    console.log(
      `  merged   ${tag.emoji} ${tag.name} into the existing cuisine (${toCreate.length} moved, ${have.size} already there)`,
    );
  }

  console.log(
    `\n${retyped} retyped, ${merged} merged, ${moved} restaurant links moved.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
