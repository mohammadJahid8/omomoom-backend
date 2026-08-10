import type { SessionUser } from '../shared/session';

export type AuthenticatedUser = SessionUser;

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;

      id: string;

      validatedQuery?: Record<string, unknown>;
    }
  }
}

export {};
