import { z } from 'zod';

const isoDate = z.iso.datetime({ offset: true }).or(z.iso.datetime());

const body = z.object({
  title: z.string().trim().min(2, 'Give the event a title').max(120),
  organiser: z.string().trim().min(2, 'Who is putting it on?').max(120),
  description: z.string().trim().min(10, 'Say what happens').max(2000),
  startsAt: isoDate,
  endsAt: isoDate.nullish(),
  venue: z.string().trim().min(2, 'Where is it?').max(160),
  neighborhood: z.string().trim().max(80).nullish(),
  ticketUrl: z.url('Enter a valid link').max(500).nullish().or(z.literal('')),
  restaurantId: z.uuid().nullish().or(z.literal('')),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
});

const endsAfterStart = <T extends { startsAt: string; endsAt?: unknown }>(
  value: T,
) =>
  !value.endsAt ||
  typeof value.endsAt !== 'string' ||
  new Date(value.endsAt) > new Date(value.startsAt);

const create = z.object({
  body: body.refine(endsAfterStart, {
    message: 'The end has to come after the start',
    path: ['endsAt'],
  }),
});

const update = z.object({
  body: body.partial().refine(
    (value) =>
      !value.startsAt || !value.endsAt || endsAfterStart(value as never),
    { message: 'The end has to come after the start', path: ['endsAt'] },
  ),
});

const list = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(50).default(6),
    when: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
    restaurantId: z.uuid().optional(),
  }),
});

const adminList = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ALL']).default('ALL'),
  }),
});

export const EventValidation = { create, update, list, adminList };
export type CreateEventBody = z.infer<typeof create>['body'];
export type UpdateEventBody = z.infer<typeof update>['body'];
export type ListEventQuery = z.infer<typeof list>['query'];
export type AdminListEventQuery = z.infer<typeof adminList>['query'];
