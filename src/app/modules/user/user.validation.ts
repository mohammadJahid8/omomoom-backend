import { z } from 'zod';

const list = z.object({
  query: z.object({
    q: z.string().trim().max(120).optional(),
    role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN', 'ALL']).default('ALL'),
    state: z.enum(['ACTIVE', 'DISABLED', 'ALL']).default('ALL'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  }),
});

const update = z.object({
  body: z
    .object({
      role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN']).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'Nothing to change',
    }),
});

export const UserValidation = { list, update };
export type ListUsersQuery = z.infer<typeof list>['query'];
export type UpdateUserBody = z.infer<typeof update>['body'];
