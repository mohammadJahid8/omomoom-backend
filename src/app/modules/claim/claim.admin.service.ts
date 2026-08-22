import { StatusCodes } from 'http-status-codes';

import ApiError from '../../../errors/ApiError';
import type { Prisma } from '../../../generated/prisma/client';
import {
  ClaimState,
  ClaimStatus,
  RestaurantStatus,
  SubscriptionStatus,
} from '../../../generated/prisma/enums';
import prisma from '../../../shared/prisma';
import type { SessionUser } from '../../../shared/session';

import { paymentProvider } from '../subscription/subscription.provider';

import type {
  AdminDecideBody,
  AdminListQuery,
  AdminRevokeBody,
} from './claim.validation';

const MAX_ATTEMPTS = 5;

const rowSelect = {
  id: true,
  status: true,
  claimantRole: true,
  workEmail: true,
  mobilePhone: true,
  note: true,
  verificationMethod: true,
  verifiedAt: true,
  codeSentTo: true,
  codeExpiresAt: true,
  codeAttempts: true,
  reviewNote: true,
  reviewedAt: true,
  reviewedById: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      avatarUrl: true,
      createdAt: true,
    },
  },
  restaurant: {
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      claimState: true,
      phone: true,
      email: true,
      websiteUrl: true,
      municipality: true,
      neighborhood: { select: { name: true } },
      owners: {
        select: {
          userId: true,
          createdAt: true,
          user: { select: { id: true, name: true, username: true, email: true } },
        },
      },
    },
  },
} as const;

type ClaimRow = Prisma.RestaurantClaimGetPayload<{ select: typeof rowSelect }>;

/**
 * Why this row is on an admin's desk. Derived rather than stored: the same
 * claim table carries ordinary claims and new-listing submissions, and what
 * distinguishes them is the state of the restaurant it points at.
 */
export type ClaimKind =
  | 'NEW_LISTING'
  | 'MANUAL'
  | 'STALLED'
  | 'IN_PROGRESS';

const kindOf = (claim: ClaimRow): ClaimKind => {
  if (claim.restaurant.status === RestaurantStatus.DRAFT) return 'NEW_LISTING';

  if (claim.verificationMethod === 'MANUAL') return 'MANUAL';

  const expired = Boolean(
    claim.codeExpiresAt && claim.codeExpiresAt < new Date(),
  );
  if (expired || claim.codeAttempts >= MAX_ATTEMPTS) return 'STALLED';

  return 'IN_PROGRESS';
};

/**
 * The desk only holds what a person has to settle. A code that has been sent
 * and not yet typed in is not admin work, so it waits somewhere else.
 */
const openWhere = (): Prisma.RestaurantClaimWhereInput => ({
  status: ClaimStatus.PENDING,
  OR: [
    { verificationMethod: 'MANUAL' },
    { restaurant: { status: RestaurantStatus.DRAFT } },
    { codeExpiresAt: { lt: new Date() } },
    { codeAttempts: { gte: MAX_ATTEMPTS } },
  ],
});

const viewWhere = (view: AdminListQuery['view']): Prisma.RestaurantClaimWhereInput => {
  if (view === 'OPEN') return openWhere();
  if (view === 'WAITING') {
    return { status: ClaimStatus.PENDING, NOT: openWhere() };
  }
  if (view === 'DECIDED') {
    return { status: { in: [ClaimStatus.APPROVED, ClaimStatus.REJECTED] } };
  }
  return {};
};

const searchWhere = (q?: string): Prisma.RestaurantClaimWhereInput =>
  q
    ? {
        OR: [
          { restaurant: { name: { contains: q, mode: 'insensitive' } } },
          { user: { name: { contains: q, mode: 'insensitive' } } },
          { user: { email: { contains: q, mode: 'insensitive' } } },
          { workEmail: { contains: q, mode: 'insensitive' } },
        ],
      }
    : {};

/** Admins are stored as a plain id on the claim, so their names come separately. */
async function reviewerNames(rows: ClaimRow[]) {
  const ids = [...new Set(rows.map((row) => row.reviewedById).filter(Boolean))];
  if (ids.length === 0) return new Map<string, string>();

  const admins = await prisma.user.findMany({
    where: { id: { in: ids as string[] } },
    select: { id: true, name: true },
  });

  return new Map(admins.map((admin) => [admin.id, admin.name]));
}

const list = async (query: AdminListQuery) => {
  const where: Prisma.RestaurantClaimWhereInput = {
    AND: [viewWhere(query.view), searchWhere(query.q)],
  };

  const [rows, total, open, waiting, decided] = await Promise.all([
    prisma.restaurantClaim.findMany({
      where,
      orderBy: { createdAt: query.view === 'DECIDED' ? 'desc' : 'asc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: rowSelect,
    }),
    prisma.restaurantClaim.count({ where }),
    prisma.restaurantClaim.count({ where: viewWhere('OPEN') }),
    prisma.restaurantClaim.count({ where: viewWhere('WAITING') }),
    prisma.restaurantClaim.count({ where: viewWhere('DECIDED') }),
  ]);

  const names = await reviewerNames(rows);

  return {
    data: rows.map((row) => ({
      ...row,
      kind: kindOf(row),
      reviewedBy: row.reviewedById
        ? (names.get(row.reviewedById) ?? 'An admin')
        : null,
    })),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      hasNextPage: query.page * query.limit < total,
      hasPrevPage: query.page > 1,
      counts: { open, waiting, decided },
    },
  };
};

async function loadForDecision(id: string) {
  const claim = await prisma.restaurantClaim.findUnique({
    where: { id },
    select: rowSelect,
  });

  if (!claim) throw new ApiError(StatusCodes.NOT_FOUND, 'Claim not found');

  if (
    claim.status === ClaimStatus.APPROVED ||
    claim.status === ClaimStatus.REJECTED
  ) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'This claim has already been settled',
    );
  }

  return claim;
}

/** Adds an owner rather than replacing one. Removing one is revoke, below. */
const decide = async (
  actor: SessionUser,
  id: string,
  input: AdminDecideBody,
) => {
  const claim = await loadForDecision(id);
  const now = new Date();

  if (input.action === 'REJECT') {
    return prisma.restaurantClaim.update({
      where: { id: claim.id },
      data: {
        status: ClaimStatus.REJECTED,
        reviewedById: actor.id,
        reviewedAt: now,
        reviewNote: input.note,
        codeHash: null,
        codeExpiresAt: null,
      },
      select: rowSelect,
    });
  }

  const publishing = claim.restaurant.status === RestaurantStatus.DRAFT;

  const [, , approved] = await prisma.$transaction([
    prisma.restaurantOwner.upsert({
      where: {
        restaurantId_userId: {
          restaurantId: claim.restaurant.id,
          userId: claim.user.id,
        },
      },
      create: { restaurantId: claim.restaurant.id, userId: claim.user.id },
      update: {},
    }),
    prisma.restaurant.update({
      where: { id: claim.restaurant.id },
      data: {
        claimState: ClaimState.CLAIMED,
        ...(publishing ? { status: RestaurantStatus.PUBLISHED } : {}),
      },
    }),
    prisma.restaurantClaim.update({
      where: { id: claim.id },
      data: {
        status: ClaimStatus.APPROVED,
        verificationMethod: claim.verificationMethod ?? 'MANUAL',
        verifiedAt: claim.verifiedAt ?? now,
        reviewedById: actor.id,
        reviewedAt: now,
        reviewNote: input.note ?? null,
        codeHash: null,
        codeExpiresAt: null,
        codeAttempts: 0,
      },
      select: rowSelect,
    }),
  ]);

  return approved;
};

/** The undo: ownership back, claim corrected, and billing stopped. */
const revoke = async (actor: SessionUser, input: AdminRevokeBody) => {
  const link = await prisma.restaurantOwner.findUnique({
    where: {
      restaurantId_userId: {
        restaurantId: input.restaurantId,
        userId: input.userId,
      },
    },
    select: {
      restaurant: {
        select: {
          id: true,
          subscriptionStatus: true,
          subscriptionRef: true,
        },
      },
    },
  });

  if (!link) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      'That person does not hold this restaurant',
    );
  }

  const paying =
    link.restaurant.subscriptionStatus === SubscriptionStatus.ACTIVE ||
    link.restaurant.subscriptionStatus === SubscriptionStatus.PAST_DUE;

  await prisma.restaurantOwner.delete({
    where: {
      restaurantId_userId: {
        restaurantId: input.restaurantId,
        userId: input.userId,
      },
    },
  });

  const remaining = await prisma.restaurantOwner.count({
    where: { restaurantId: input.restaurantId },
  });

  if (remaining === 0 && paying) {
    // Not at the period end: they have lost the listing already, so there is
    // nothing left for them to be paying for.
    await paymentProvider.cancelNow(link.restaurant.subscriptionRef);
  }

  await prisma.$transaction([
    prisma.restaurantClaim.updateMany({
      where: {
        restaurantId: input.restaurantId,
        userId: input.userId,
        status: ClaimStatus.APPROVED,
      },
      data: {
        status: ClaimStatus.REJECTED,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        reviewNote: input.note,
      },
    }),
    prisma.restaurant.update({
      where: { id: input.restaurantId },
      data:
        remaining === 0
          ? {
              claimState: ClaimState.UNCLAIMED,
              ...(paying
                ? {
                    subscriptionStatus: SubscriptionStatus.CANCELLED,
                    subscribedUntil: new Date(),
                  }
                : {}),
            }
          : {},
    }),
  ]);

  return { restaurantId: input.restaurantId, ownersLeft: remaining };
};

export const ClaimAdminService = { list, decide, revoke };
