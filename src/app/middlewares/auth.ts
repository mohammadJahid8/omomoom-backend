import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import ApiError from '../../errors/ApiError';
import type { Role } from '../../generated/prisma/enums';
import { readSessionToken, resolveSession } from '../../shared/session';

const ADMIN_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];

const attach = async (req: Request): Promise<void> => {
  if (req.user) return;
  const user = await resolveSession(readSessionToken(req));
  if (user) req.user = user;
};

export const optionalAuth: RequestHandler = (req, _res, next) => {
  attach(req)
    .then(() => next())
    .catch(next);
};

export const requireAuth =
  (...roles: Role[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    attach(req)
      .then(() => {
        if (!req.user) {
          throw new ApiError(StatusCodes.UNAUTHORIZED, 'Sign in to continue');
        }
        if (roles.length > 0 && !roles.includes(req.user.role)) {
          throw new ApiError(
            StatusCodes.FORBIDDEN,
            'You do not have permission to do that',
          );
        }
        next();
      })
      .catch(next);
  };

export const requireAdmin = requireAuth(...ADMIN_ROLES);

export const isAdmin = (role: Role): boolean => ADMIN_ROLES.includes(role);

/**
 * Ownership is a relationship, not a role: a person owns specific restaurants
 * and is an ordinary diner everywhere else. Admins pass regardless.
 */
export const requireRestaurantAccess =
  (param = 'id'): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    attach(req)
      .then(() => {
        if (!req.user) {
          throw new ApiError(StatusCodes.UNAUTHORIZED, 'Sign in to continue');
        }
        if (isAdmin(req.user.role)) return next();

        const raw = req.params[param];
        const restaurantId = Array.isArray(raw) ? raw[0] : raw;
        if (!restaurantId || !req.user.ownedRestaurantIds.includes(restaurantId)) {
          throw new ApiError(
            StatusCodes.FORBIDDEN,
            'You do not manage that restaurant',
          );
        }
        next();
      })
      .catch(next);
  };

export default requireAuth;
