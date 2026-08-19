import { z } from 'zod';

export const CLAIMANT_ROLES = [
  'Owner',
  'Co-owner or partner',
  'General manager',
  'Manager',
  'Marketing or PR',
  'Other authorised representative',
] as const;

const start = z.object({
  body: z.object({
    restaurantId: z.uuid(),
    claimantRole: z.enum(CLAIMANT_ROLES),
    workEmail: z.string().trim().toLowerCase().email('Enter a valid email'),
    mobilePhone: z
      .string()
      .trim()
      .min(7, 'Enter a phone we can reach you on')
      .max(40),
    authorised: z.literal(true, {
      error: 'Confirm you are authorised to manage this restaurant',
    }),
  }),
});

const sendCode = z.object({
  body: z.object({
    method: z.enum(['PHONE', 'EMAIL_DOMAIN']),
  }),
});

const verify = z.object({
  body: z.object({
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Enter the six digit code'),
  }),
});

const manual = z.object({
  body: z.object({
    note: z
      .string()
      .trim()
      .min(20, 'Tell us a little about your connection to the restaurant')
      .max(1000),
  }),
});

const suggest = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'What is it called?').max(160),
    municipality: z.string().trim().min(2, 'Which city?').max(120),
    addressLine: z.string().trim().max(240).nullish().or(z.literal('')),
    phone: z.string().trim().max(40).nullish().or(z.literal('')),
    websiteUrl: z.url('Enter a full URL').max(500).nullish().or(z.literal('')),
    claimantRole: z.enum(CLAIMANT_ROLES),
    workEmail: z.string().trim().toLowerCase().email('Enter a valid email'),
    mobilePhone: z.string().trim().min(7).max(40),
    note: z
      .string()
      .trim()
      .min(20, 'Tell us a little about the restaurant')
      .max(1000),
  }),
});

const adminList = z.object({
  query: z.object({
    view: z.enum(['OPEN', 'WAITING', 'DECIDED', 'ALL']).default('OPEN'),
    q: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

const adminDecide = z.object({
  body: z
    .object({
      action: z.enum(['APPROVE', 'REJECT']),
      note: z.string().trim().max(1000).optional(),
    })
    .refine(
      (value) =>
        value.action !== 'REJECT' || (value.note ?? '').trim().length >= 5,
      {
        error: 'Say why, so the claimant is told something useful',
        path: ['note'],
      },
    ),
});

const adminRevoke = z.object({
  body: z.object({
    restaurantId: z.uuid(),
    userId: z.uuid(),
    note: z
      .string()
      .trim()
      .min(5, 'Record why ownership is being taken back')
      .max(1000),
  }),
});

export const ClaimValidation = {
  start,
  sendCode,
  verify,
  manual,
  suggest,
  adminList,
  adminDecide,
  adminRevoke,
};
export type AdminListQuery = z.infer<typeof adminList>['query'];
export type AdminDecideBody = z.infer<typeof adminDecide>['body'];
export type AdminRevokeBody = z.infer<typeof adminRevoke>['body'];
export type SuggestBody = z.infer<typeof suggest>['body'];
export type StartClaimBody = z.infer<typeof start>['body'];
export type SendCodeBody = z.infer<typeof sendCode>['body'];
export type VerifyBody = z.infer<typeof verify>['body'];
export type ManualBody = z.infer<typeof manual>['body'];
