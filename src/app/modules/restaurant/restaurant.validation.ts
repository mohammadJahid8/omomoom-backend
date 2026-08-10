import { z } from 'zod';

import { MichelinRating, PriceTier } from '../../../generated/prisma/enums';
import {
  multiEnum,
  multiValue,
  optionalBoolean,
} from '../../../shared/zodHelpers';

import { RESTAURANT_SORT_FIELDS } from './restaurant.constant';

const PRICE_VALUES = Object.keys(PriceTier) as [string, ...string[]];
const MICHELIN_VALUES = Object.keys(MichelinRating) as [string, ...string[]];

const getRestaurants = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().max(10_000).optional(),
    limit: z.coerce.number().int().positive().max(60).optional(),

    sortBy: z.enum(RESTAURANT_SORT_FIELDS).optional(),

    q: z.string().trim().max(120).optional(),

    cuisine: multiValue().optional(),
    area: multiValue().optional(),
    dish: multiValue().optional(),
    feature: multiValue().optional(),
    occasion: multiValue().optional(),
    dietary: multiValue().optional(),

    price: multiEnum(PRICE_VALUES, 4).optional(),
    michelin: multiEnum(MICHELIN_VALUES, 5).optional(),

    claimed: optionalBoolean,

    facets: optionalBoolean,
  }),
});

const getRestaurantBySlug = z.object({
  params: z.object({
    slug: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Not a valid restaurant slug'),
  }),
});

export const RestaurantValidation = {
  getRestaurants,
  getRestaurantBySlug,
};

export type GetRestaurantsQuery = z.infer<typeof getRestaurants>['query'];
