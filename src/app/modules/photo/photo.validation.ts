import { z } from 'zod';

const queue = z.object({
  query: z.object({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(24),
  }),
});

const decide = z.object({
  body: z.object({
    action: z.enum(['APPROVE', 'REJECT']),
  }),
});

export const PhotoValidation = { queue, decide };
export type QueueQuery = z.infer<typeof queue>['query'];
export type DecideBody = z.infer<typeof decide>['body'];
