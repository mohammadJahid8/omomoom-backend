import express from 'express';
import rateLimit from 'express-rate-limit';

import config from '../../../config';
import { optionalAuth, requireAuth } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';

import { AuthController } from './auth.controller';
import { AuthValidation } from './auth.validation';

const router = express.Router();

/**
 * Per-instance and therefore leaky on serverless, which is why the real
 * protection is the database-backed lockout in the service. This only blunts
 * the crudest floods before they reach Postgres.
 */
const credentialLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  /**
   * Off for local requests in development. Running the auth suite twice would
   * otherwise exhaust the window and report confusing failures that look like
   * bugs. The database-backed lockout still applies, so brute force is still
   * tested locally.
   */
  skip: (req) =>
    config.isDevelopment &&
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip ?? ''),
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many attempts. Give it a few minutes.',
    errorDetails: [{ path: '', message: 'Rate limit exceeded' }],
  },
});

router.post(
  '/register',
  credentialLimit,
  validateRequest(AuthValidation.register),
  AuthController.register,
);

router.post(
  '/login',
  credentialLimit,
  validateRequest(AuthValidation.login),
  AuthController.login,
);

router.get('/google', credentialLimit, AuthController.googleStart);
router.get('/google/callback', AuthController.googleCallback);

router.post('/logout', AuthController.logout);
router.post('/logout-everywhere', requireAuth(), AuthController.logoutEverywhere);

router.get('/session', optionalAuth, AuthController.session);

router.get('/me', requireAuth(), AuthController.me);
router.patch(
  '/me',
  requireAuth(),
  validateRequest(AuthValidation.updateProfile),
  AuthController.updateProfile,
);

export const AuthRoutes = router;
