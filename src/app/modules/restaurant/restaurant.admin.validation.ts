import { z } from 'zod';

const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().or(z.literal(''));

const optionalUrl = z.url('Enter a full URL').max(500).nullish().or(z.literal(''));

const body = z.object({
  name: z.string().trim().min(2, 'Name the restaurant').max(160),
  status: z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']).default('DRAFT'),

  description: optionalText(2000),
  subCuisine: optionalText(120),
  /// Comma separated, matching how the column is stored.
  signatureDishes: optionalText(400),

  neighborhoodId: z.uuid().nullish().or(z.literal('')),
  municipality: optionalText(120),
  addressLine: optionalText(240),

  phone: optionalText(40),
  websiteUrl: optionalUrl,
  menuUrl: optionalUrl,
  reservationUrl: optionalUrl,

  hoursText: optionalText(400),
  priceTier: z.enum(['ONE', 'TWO', 'THREE', 'FOUR']).nullish().or(z.literal('')),
  michelin: z
    .enum(['SELECTED', 'BIB_GOURMAND', 'ONE_STAR', 'TWO_STARS', 'THREE_STARS'])
    .nullish()
    .or(z.literal('')),
});

const create = z.object({ body });
const update = z.object({ body: body.partial() });

const list = z.object({
  query: z.object({
    q: z.string().trim().max(120).optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN', 'ALL']).default('ALL'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  }),
});

export const RestaurantAdminValidation = { create, update, list };
export type AdminRestaurantBody = z.infer<typeof create>['body'];
export type AdminRestaurantPatch = z.infer<typeof update>['body'];
export type AdminRestaurantQuery = z.infer<typeof list>['query'];
