import { z } from 'zod';

import { IMAGE_TYPES } from '../../../shared/storage';

const sign = z.object({
  body: z
    .object({
      purpose: z.enum(['AVATAR', 'RESTAURANT_PHOTO', 'USER_PHOTO']),
      contentType: z.enum(IMAGE_TYPES as [string, ...string[]], {
        error: 'That file type is not supported. Use JPEG, PNG, WebP or AVIF.',
      }),
      size: z.number().int().positive('That file looks empty'),
      restaurantId: z.uuid().optional(),
    })
    .refine(
      (value) =>
        value.purpose === 'AVATAR' || Boolean(value.restaurantId),
      { error: 'Which restaurant is this for?', path: ['restaurantId'] },
    ),
});

export const UploadValidation = { sign };
export type SignBody = z.infer<typeof sign>['body'];
