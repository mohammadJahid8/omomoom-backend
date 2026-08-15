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

export const ClaimValidation = { start, sendCode, verify, manual };
export type StartClaimBody = z.infer<typeof start>['body'];
export type SendCodeBody = z.infer<typeof sendCode>['body'];
export type VerifyBody = z.infer<typeof verify>['body'];
export type ManualBody = z.infer<typeof manual>['body'];
