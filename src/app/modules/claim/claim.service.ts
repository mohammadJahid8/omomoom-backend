import { StatusCodes } from 'http-status-codes';

import ApiError from '../../../errors/ApiError';
import {
  ClaimState,
  ClaimStatus,
  RestaurantStatus,
} from '../../../generated/prisma/enums';
import prisma from '../../../shared/prisma';

import {
  codeIsMocked,
  hashCode,
  maskEmail,
  maskPhone,
  sendCode as deliverCode,
  type DeliveryChannel,
} from './claim.delivery';
import type {
  ManualBody,
  SendCodeBody,
  StartClaimBody,
  VerifyBody,
} from './claim.validation';

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const claimSelect = {
  id: true,
  status: true,
  claimantRole: true,
  workEmail: true,
  mobilePhone: true,
  verificationMethod: true,
  verifiedAt: true,
  codeSentTo: true,
  codeExpiresAt: true,
  createdAt: true,
  restaurant: { select: { id: true, slug: true, name: true } },
} as const;

const domainOf = (value: string): string | null => {
  const match = /@([^@\s]+)$/.exec(value.trim().toLowerCase());
  return match ? (match[1] ?? null) : null;
};

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
};

export type VerificationOption = {
  method: DeliveryChannel | 'MANUAL';
  label: string;
  detail: string;
  target: string | null;
};

/**
 * Only the routes this particular listing can actually support, worked out
 * from what we hold on it. An owner never sees an option that cannot complete.
 */
export function optionsFor(
  restaurant: { phone: string | null; websiteUrl: string | null },
  workEmail: string,
): VerificationOption[] {
  const options: VerificationOption[] = [];

  if (restaurant.phone) {
    options.push({
      method: 'PHONE',
      label: 'Text the restaurant phone',
      detail: `We send a six digit code to ${maskPhone(restaurant.phone)}, the number on this listing.`,
      target: maskPhone(restaurant.phone),
    });
  }

  const site = restaurant.websiteUrl ? hostOf(restaurant.websiteUrl) : null;
  const mail = domainOf(workEmail);

  if (site && mail && (mail === site || mail.endsWith(`.${site}`))) {
    options.push({
      method: 'EMAIL_DOMAIN',
      label: 'Email your work address',
      detail: `${maskEmail(workEmail)} is on the restaurant's own domain, so we can send a code there.`,
      target: maskEmail(workEmail),
    });
  }

  options.push({
    method: 'MANUAL',
    label: 'Ask us to review it',
    detail:
      'Tell us how you are connected and we will come back within two business days.',
    target: null,
  });

  return options;
}

async function loadOpenClaim(userId: string, claimId: string) {
  const claim = await prisma.restaurantClaim.findUnique({
    where: { id: claimId },
    select: {
      ...claimSelect,
      userId: true,
      codeHash: true,
      codeAttempts: true,
      restaurant: {
        select: {
          id: true,
          slug: true,
          name: true,
          phone: true,
          websiteUrl: true,
          claimState: true,
        },
      },
    },
  });

  if (!claim || claim.userId !== userId) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Claim not found');
  }

  if (claim.status === ClaimStatus.APPROVED) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'This claim is already approved',
    );
  }

  return claim;
}

const start = async (userId: string, input: StartClaimBody) => {
  const restaurant = await prisma.restaurant.findFirst({
    where: { id: input.restaurantId, status: RestaurantStatus.PUBLISHED },
    select: {
      id: true,
      slug: true,
      name: true,
      phone: true,
      websiteUrl: true,
      claimState: true,
    },
  });

  if (!restaurant) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  if (restaurant.claimState === ClaimState.CLAIMED) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'Someone has already claimed this restaurant. Report a problem if that should be you.',
    );
  }

  const data = {
    claimantRole: input.claimantRole,
    workEmail: input.workEmail,
    mobilePhone: input.mobilePhone,
  };

  const claim = await prisma.restaurantClaim.upsert({
    where: {
      restaurantId_userId: { restaurantId: restaurant.id, userId },
    },
    create: { ...data, restaurantId: restaurant.id, userId },
    update: data,
    select: claimSelect,
  });

  return {
    claim,
    options: optionsFor(restaurant, input.workEmail),
  };
};

const issueCode = async (
  userId: string,
  claimId: string,
  input: SendCodeBody,
) => {
  const claim = await loadOpenClaim(userId, claimId);

  const available = optionsFor(claim.restaurant, claim.workEmail);
  if (!available.some((option) => option.method === input.method)) {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      'That verification route is not available for this restaurant',
    );
  }

  const destination =
    input.method === 'PHONE'
      ? (claim.restaurant.phone as string)
      : claim.workEmail;

  const code = await deliverCode(input.method, destination);

  const masked =
    input.method === 'PHONE' ? maskPhone(destination) : maskEmail(destination);

  await prisma.restaurantClaim.update({
    where: { id: claim.id },
    data: {
      verificationMethod: input.method,
      codeHash: hashCode(code),
      codeSentTo: masked,
      codeExpiresAt: new Date(Date.now() + CODE_TTL_MS),
      codeAttempts: 0,
    },
  });

  return { sentTo: masked, mocked: codeIsMocked };
};

const verify = async (userId: string, claimId: string, input: VerifyBody) => {
  const claim = await loadOpenClaim(userId, claimId);

  if (!claim.codeHash || !claim.codeExpiresAt) {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      'Ask for a code first',
    );
  }

  if (claim.codeExpiresAt < new Date()) {
    throw new ApiError(
      StatusCodes.GONE,
      'That code has expired. Send yourself a new one.',
    );
  }

  if (claim.codeAttempts >= MAX_ATTEMPTS) {
    throw new ApiError(
      StatusCodes.TOO_MANY_REQUESTS,
      'Too many wrong codes. Send yourself a new one.',
    );
  }

  if (hashCode(input.code) !== claim.codeHash) {
    await prisma.restaurantClaim.update({
      where: { id: claim.id },
      data: { codeAttempts: { increment: 1 } },
    });

    throw new ApiError(
      StatusCodes.UNAUTHORIZED,
      'That code is not right. Check it and try again.',
    );
  }

  // The code is the approval: ownership, listing state and claim all move
  // together so a half-applied claim cannot exist.
  const [, , approved] = await prisma.$transaction([
    prisma.restaurantOwner.upsert({
      where: {
        restaurantId_userId: { restaurantId: claim.restaurant.id, userId },
      },
      create: { restaurantId: claim.restaurant.id, userId },
      update: {},
    }),
    prisma.restaurant.update({
      where: { id: claim.restaurant.id },
      data: { claimState: ClaimState.CLAIMED },
    }),
    prisma.restaurantClaim.update({
      where: { id: claim.id },
      data: {
        status: ClaimStatus.APPROVED,
        verifiedAt: new Date(),
        codeHash: null,
        codeExpiresAt: null,
        codeAttempts: 0,
      },
      select: claimSelect,
    }),
  ]);

  return approved;
};

const requestManual = async (
  userId: string,
  claimId: string,
  input: ManualBody,
) => {
  const claim = await loadOpenClaim(userId, claimId);

  return prisma.restaurantClaim.update({
    where: { id: claim.id },
    data: {
      verificationMethod: 'MANUAL',
      note: input.note,
      status: ClaimStatus.PENDING,
      codeHash: null,
      codeExpiresAt: null,
    },
    select: claimSelect,
  });
};

/**
 * Everything the verify page needs to rebuild itself after a refresh: the
 * claim as it stands and the routes still open to it.
 */
const mineFor = async (userId: string, restaurantId: string) => {
  const claim = await prisma.restaurantClaim.findUnique({
    where: { restaurantId_userId: { restaurantId, userId } },
    select: claimSelect,
  });

  if (!claim) return { claim: null, options: [] as VerificationOption[] };

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: claim.restaurant.id },
    select: { phone: true, websiteUrl: true },
  });

  return {
    claim,
    options: restaurant ? optionsFor(restaurant, claim.workEmail) : [],
  };
};

export const ClaimService = {
  start,
  issueCode,
  verify,
  requestManual,
  mineFor,
  optionsFor,
};
