import { z } from 'zod';

const aspect = z.coerce
  .number()
  .int('Pick a whole number')
  .min(1)
  .max(5)
  .nullish();

const create = z.object({
  body: z.object({
    restaurantId: z.uuid(),
    dish: z
      .string()
      .trim()
      .min(2, 'Name the dish')
      .max(80, 'Keep the dish name short'),
    rating: z.coerce
      .number()
      .int('Pick a whole number')
      .min(1, 'Rate the dish from 1 to 5')
      .max(5, 'Rate the dish from 1 to 5'),
    comment: z.string().trim().max(600).nullish().or(z.literal('')),
    /**
     * Storage keys from /uploads/sign, never URLs, each verified before it is
     * kept. Dimensions come from the browser so a gallery can reserve the right
     * shape before the image arrives.
     */
    photos: z
      .array(
        z.object({
          key: z.string().trim().min(1).max(300),
          width: z.number().int().positive().max(20000).optional(),
          height: z.number().int().positive().max(20000).optional(),
        }),
      )
      .optional(),

    wouldOrderAgain: z.enum(['DEFINITELY', 'MAYBE', 'NO']).nullish(),

    taste: aspect,
    service: aspect,
    value: aspect,
    ambience: aspect,
    hygiene: aspect,
  }),
});

const listForRestaurant = z.object({
  query: z.object({
    restaurantId: z.uuid(),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  }),
});

const listRecent = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(24).default(6),
  }),
});

export const RecommendationValidation = {
  create,
  listForRestaurant,
  listRecent,
};

export type CreateRecommendationBody = z.infer<typeof create>['body'];
export type ListForRestaurantQuery = z.infer<
  typeof listForRestaurant
>['query'];
export type ListRecentQuery = z.infer<typeof listRecent>['query'];
