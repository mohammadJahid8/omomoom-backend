import { z } from 'zod';

const text = (max: number) =>
  z.string().trim().max(max).nullish().or(z.literal(''));

const link = z.url('Enter a full URL starting with https://').max(500).nullish().or(z.literal(''));

/**
  * Narrower than the admin surface on purpose. No name, status, neighbourhood
  * or Michelin: a restaurant cannot rename itself out of its own reviews.
  */
const update = z.object({
  body: z.object({
    // Hours & contact
    hoursText: text(400),
    phone: text(40),
    email: z.string().trim().toLowerCase().email('Enter a valid email').max(160).nullish().or(z.literal('')),
    addressLine: text(240),

    // Links
    websiteUrl: link,
    menuUrl: link,
    reservationUrl: link,

    // What to order
    signatureDishes: text(400),

    // Story
    description: text(2000),
    story: text(4000),
    chefStory: text(4000),
    whatMakesSpecial: text(2000),

    // Classification
    subCuisine: text(120),
    priceTier: z.enum(['ONE', 'TWO', 'THREE', 'FOUR']).nullish().or(z.literal('')),
  }).partial(),
});

const photo = z.object({
  body: z.object({
    key: z.string().trim().min(1).max(300),
    caption: z.string().trim().max(200).nullish().or(z.literal('')),
    /** Sent by the browser so the page can reserve space and never jump. */
    width: z.number().int().positive().max(20000).optional(),
    height: z.number().int().positive().max(20000).optional(),
  }),
});

const photoPatch = z.object({
  body: z
    .object({
      caption: z.string().trim().max(200).nullish().or(z.literal('')),
      isCover: z.literal(true).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      error: 'Nothing to change',
    }),
});

const photoOrder = z.object({
  body: z.object({
    ids: z.array(z.uuid()).min(1).max(100),
  }),
});

export const StudioValidation = { update, photo, photoPatch, photoOrder };
export type StudioUpdateBody = z.infer<typeof update>['body'];
export type PhotoBody = z.infer<typeof photo>['body'];
export type PhotoPatchBody = z.infer<typeof photoPatch>['body'];
export type PhotoOrderBody = z.infer<typeof photoOrder>['body'];
