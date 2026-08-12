import { StatusCodes } from 'http-status-codes';
import type { CookieOptions, Request, Response } from 'express';

import config from '../../../config';
import ApiError from '../../../errors/ApiError';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import {
  createSession,
  destroyAllSessions,
  destroySession,
  readSessionToken,
} from '../../../shared/session';

import { AuthService } from './auth.service';
import {
  GOOGLE_STATE_COOKIE,
  authorizeUrl,
  exchangeCode,
  newState,
} from './google';

const register = catchAsync(async (req: Request, res: Response) => {
  const user = await AuthService.register(req.body);
  await createSession(res, req, user.id);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Welcome to Omomoom',
    data: user,
  });
});

const login = catchAsync(async (req: Request, res: Response) => {
  const user = await AuthService.login(req.body);
  await createSession(res, req, user.id);

  sendResponse(res, { message: 'Signed in', data: user });
});

const logout = catchAsync(async (req: Request, res: Response) => {
  await destroySession(res, readSessionToken(req));
  sendResponse(res, { message: 'Signed out', data: null });
});

const logoutEverywhere = catchAsync(async (req: Request, res: Response) => {
  const count = await destroyAllSessions(req.user!.id);
  await destroySession(res, readSessionToken(req));
  sendResponse(res, {
    message: 'Signed out of every device',
    data: { sessionsEnded: count },
  });
});

const me = catchAsync(async (req: Request, res: Response) => {
  sendResponse(res, {
    message: 'Signed in user',
    data: AuthService.me(req.user!),
  });
});

const session = catchAsync(async (req: Request, res: Response) => {
  sendResponse(res, {
    message: req.user ? 'Signed in' : 'Not signed in',
    data: req.user ?? null,
  });
});

const updateProfile = catchAsync(async (req: Request, res: Response) => {
  const user = await AuthService.updateProfile(req.user!.id, req.body);
  sendResponse(res, { message: 'Profile updated', data: user });
});

const GOOGLE_NEXT_COOKIE = 'omomoom_oauth_next';

const safeNext = (value: unknown): string =>
  typeof value === 'string' && /^\/(?!\/)/.test(value) ? value : '/';

const googleStart = catchAsync(async (req: Request, res: Response) => {
  const next = safeNext(req.query.next);

  if (!config.google.enabled) {
    throw new ApiError(
      StatusCodes.SERVICE_UNAVAILABLE,
      'Google sign-in is not configured',
    );
  }

  const shortLived: CookieOptions = {
    httpOnly: true,
    sameSite: config.session.sameSite,
    secure: config.session.secure,
    path: '/',
    maxAge: 10 * 60 * 1000,
    ...(config.session.cookieDomain ? { domain: config.session.cookieDomain } : {}),
  };

  const state = newState();
  res.cookie(GOOGLE_STATE_COOKIE, state, shortLived);
  res.cookie(GOOGLE_NEXT_COOKIE, next, shortLived);

  return res.redirect(authorizeUrl(state));
});

const googleCallback = catchAsync(async (req: Request, res: Response) => {
  const next = safeNext(req.cookies?.[GOOGLE_NEXT_COOKIE]);

  const fail = (reason: string) =>
    res.redirect(
      `${config.appUrl}/join?error=${encodeURIComponent(reason)}` +
        `&next=${encodeURIComponent(next)}`,
    );

  const expected = req.cookies?.[GOOGLE_STATE_COOKIE] as string | undefined;
  res.clearCookie(GOOGLE_STATE_COOKIE, { path: '/' });
  res.clearCookie(GOOGLE_NEXT_COOKIE, { path: '/' });

  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error) return fail(error);
  if (!code || !state || !expected || state !== expected) {
    return fail('invalid_state');
  }

  const profile = await exchangeCode(code);
  const { user, isNew } = await AuthService.upsertGoogleUser(profile);
  await createSession(res, req, user.id);

  return res.redirect(
    isNew
      ? `${config.appUrl}/welcome?next=${encodeURIComponent(next)}`
      : `${config.appUrl}${next}`,
  );
});

export const AuthController = {
  register,
  login,
  logout,
  logoutEverywhere,
  me,
  session,
  updateProfile,
  googleStart,
  googleCallback,
};
