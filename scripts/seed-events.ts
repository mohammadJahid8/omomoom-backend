import { EventStatus } from '../src/generated/prisma/enums';
import prisma from '../src/shared/prisma';

type Seed = {
  slug: string;
  title: string;
  organiser: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  neighborhood: string | null;
  restaurantSlug?: string;
};

const MIAMI_TZ = 'America/New_York';

const miamiOffsetMs = (instant: Date): number => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: MIAMI_TZ,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );

  return (
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
      Number(parts.second),
    ) - instant.getTime()
  );
};

/**
 * Relative to the run so the calendar is never empty in dev, and pinned to
 * Miami's clock rather than whatever timezone the seed happens to run in.
 */
const inDays = (days: number, hour: number, minute = 0) => {
  const day = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const stamp = new Date(day.getTime() + miamiOffsetMs(day))
    .toISOString()
    .slice(0, 10);

  const naive = Date.parse(
    `${stamp}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
  );

  let instant = naive;
  for (let pass = 0; pass < 2; pass += 1) {
    instant = naive - miamiOffsetMs(new Date(instant));
  }

  return new Date(instant).toISOString();
};

const SEEDS: Seed[] = [
  {
    slug: 'wynwood-night-market',
    title: 'Wynwood Night Market',
    organiser: 'Miami Asian Night Market Co.',
    description:
      'Forty stalls of Taiwanese street food, Filipino barbecue and bubble tea, plus a live DJ until close.',
    startsAt: inDays(5, 18),
    endsAt: inDays(5, 23),
    venue: 'Wynwood Marketplace',
    neighborhood: 'Wynwood',
  },
  {
    slug: 'mid-autumn-mooncake-festival',
    title: 'Mid-Autumn Mooncake Festival',
    organiser: 'Miami Asians',
    description:
      'Mooncake tasting from six bakeries, lantern making for kids, and a Hong Kong style mahjong table running all afternoon.',
    startsAt: inDays(13, 12),
    endsAt: inDays(13, 17),
    venue: '1-800-Lucky Food Hall',
    neighborhood: 'Wynwood',
    restaurantSlug: '1-800-lucky-food-hall',
  },
  {
    slug: 'omakase-101-with-chef-shingo',
    title: 'Omakase 101 with Chef Shingo',
    organiser: 'Omomoom',
    description:
      'Twelve seats, ten courses, and an explanation of every cut as it lands. Beginners genuinely welcome.',
    startsAt: inDays(26, 19),
    endsAt: null,
    venue: 'Shingo',
    neighborhood: 'Coral Gables',
    restaurantSlug: 'shingo',
  },
  {
    slug: 'kamayan-feast',
    title: 'Kamayan Feast',
    organiser: 'Sili Miami',
    description:
      'A banana leaf spread eaten with your hands. Lechon, inasal, ensaymada, and no cutlery on the table.',
    startsAt: inDays(33, 18, 30),
    endsAt: inDays(33, 21, 30),
    venue: 'Sili Miami',
    neighborhood: 'Wynwood',
  },
  {
    slug: 'miami-ramen-week',
    title: 'Miami Ramen Week',
    organiser: 'Omomoom',
    description:
      'Fourteen kitchens, one bowl each, fixed price all week. No tickets needed, just turn up hungry.',
    startsAt: inDays(42, 11),
    endsAt: inDays(48, 22),
    venue: 'Across Miami',
    neighborhood: null,
  },
  {
    slug: 'board-game-night-at-cho',
    title: 'Board Game Night at CHO',
    organiser: 'Miami Asians',
    description:
      'A casual night to meet people over dumplings and a stack of board games. No experience required.',
    startsAt: inDays(52, 19),
    endsAt: null,
    venue: 'CHO Funky Asian Bistro',
    neighborhood: 'Coral Gables',
  },
];

async function main() {
  let created = 0;
  let updated = 0;

  for (const seed of SEEDS) {
    const restaurant = seed.restaurantSlug
      ? await prisma.restaurant.findFirst({
          where: { slug: seed.restaurantSlug },
          select: { id: true },
        })
      : null;

    const data = {
      title: seed.title,
      organiser: seed.organiser,
      description: seed.description,
      startsAt: new Date(seed.startsAt),
      endsAt: seed.endsAt ? new Date(seed.endsAt) : null,
      venue: seed.venue,
      neighborhood: seed.neighborhood,
      restaurantId: restaurant?.id ?? null,
      status: EventStatus.PUBLISHED,
    };

    const existing = await prisma.event.findUnique({
      where: { slug: seed.slug },
      select: { id: true },
    });

    if (existing) {
      await prisma.event.update({ where: { slug: seed.slug }, data });
      updated += 1;
    } else {
      await prisma.event.create({ data: { ...data, slug: seed.slug } });
      created += 1;
    }
  }

  console.log(`Events seeded. ${created} created, ${updated} updated.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
