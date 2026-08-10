import { StatusCodes } from 'http-status-codes';

import ApiError from '../../../errors/ApiError';
import { EventStatus } from '../../../generated/prisma/enums';
import prisma from '../../../shared/prisma';

import type {
  AdminListEventQuery,
  CreateEventBody,
  ListEventQuery,
  UpdateEventBody,
} from './event.validation';

const publicSelect = {
  id: true,
  slug: true,
  title: true,
  organiser: true,
  description: true,
  startsAt: true,
  endsAt: true,
  venue: true,
  neighborhood: true,
  ticketUrl: true,
  restaurant: { select: { slug: true, name: true } },
} as const;

const adminSelect = {
  ...publicSelect,
  status: true,
  restaurantId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const slugify = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'event';

async function uniqueSlug(title: string, ignoreId?: string): Promise<string> {
  const base = slugify(title);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await prisma.event.findFirst({
      where: { slug, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
      select: { id: true },
    });
    if (!clash) return slug;
  }

  return `${base}-${Date.now().toString(36)}`;
}

const blankToNull = (value: unknown) =>
  value === '' || value === undefined ? null : value;

/**
 * An event stays listed until it actually finishes, so a week-long festival
 * does not vanish from the page on day one.
 */
const upcomingWhere = () => {
  const now = new Date();
  return {
    status: EventStatus.PUBLISHED,
    OR: [{ endsAt: { gte: now } }, { endsAt: null, startsAt: { gte: now } }],
  };
};

const listPublic = async (query: ListEventQuery) => {
  const now = new Date();

  const where =
    query.when === 'all'
      ? { status: EventStatus.PUBLISHED }
      : query.when === 'past'
        ? {
            status: EventStatus.PUBLISHED,
            OR: [{ endsAt: { lt: now } }, { endsAt: null, startsAt: { lt: now } }],
          }
        : upcomingWhere();

  return prisma.event.findMany({
    where: {
      ...where,
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
    },
    orderBy: { startsAt: query.when === 'past' ? 'desc' : 'asc' },
    take: query.limit,
    select: publicSelect,
  });
};

const listForAdmin = async (query: AdminListEventQuery) =>
  prisma.event.findMany({
    where: query.status === 'ALL' ? {} : { status: query.status },
    orderBy: { startsAt: 'desc' },
    take: query.limit,
    select: adminSelect,
  });

const getById = async (id: string) => {
  const event = await prisma.event.findUnique({ where: { id }, select: adminSelect });
  if (!event) throw new ApiError(StatusCodes.NOT_FOUND, 'Event not found');
  return event;
};

const create = async (input: CreateEventBody) =>
  prisma.event.create({
    data: {
      title: input.title,
      slug: await uniqueSlug(input.title),
      organiser: input.organiser,
      description: input.description,
      startsAt: new Date(input.startsAt),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      venue: input.venue,
      neighborhood: (blankToNull(input.neighborhood) as string) ?? null,
      ticketUrl: (blankToNull(input.ticketUrl) as string) ?? null,
      restaurantId: (blankToNull(input.restaurantId) as string) ?? null,
      status: input.status,
    },
    select: adminSelect,
  });

const update = async (id: string, input: UpdateEventBody) => {
  await getById(id);

  return prisma.event.update({
    where: { id },
    data: {
      ...(input.title === undefined
        ? {}
        : { title: input.title, slug: await uniqueSlug(input.title, id) }),
      ...(input.organiser === undefined ? {} : { organiser: input.organiser }),
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      ...(input.startsAt === undefined
        ? {}
        : { startsAt: new Date(input.startsAt) }),
      ...(input.endsAt === undefined
        ? {}
        : { endsAt: input.endsAt ? new Date(input.endsAt) : null }),
      ...(input.venue === undefined ? {} : { venue: input.venue }),
      ...(input.neighborhood === undefined
        ? {}
        : { neighborhood: blankToNull(input.neighborhood) as string | null }),
      ...(input.ticketUrl === undefined
        ? {}
        : { ticketUrl: blankToNull(input.ticketUrl) as string | null }),
      ...(input.restaurantId === undefined
        ? {}
        : { restaurantId: blankToNull(input.restaurantId) as string | null }),
      ...(input.status === undefined ? {} : { status: input.status }),
    },
    select: adminSelect,
  });
};

const remove = async (id: string) => {
  await getById(id);
  await prisma.event.delete({ where: { id } });
};

export const EventService = {
  listPublic,
  listForAdmin,
  getById,
  create,
  update,
  remove,
};
