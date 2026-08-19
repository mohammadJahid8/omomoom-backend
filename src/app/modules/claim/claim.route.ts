import express from 'express';

import { requireAdmin, requireAuth } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';

import { ClaimController } from './claim.controller';
import { ClaimValidation } from './claim.validation';

const router = express.Router();

/**
 * The exceptions desk. A verified code approves itself, so what reaches an
 * admin is only what a code could not settle: manual requests, new-listing
 * submissions and claims that stalled.
 */
const admin = express.Router();

admin.use(requireAdmin);

admin.get(
  '/',
  validateRequest(ClaimValidation.adminList),
  ClaimController.adminList,
);

admin.post(
  '/revoke',
  validateRequest(ClaimValidation.adminRevoke),
  ClaimController.adminRevoke,
);

admin.patch(
  '/:id',
  validateRequest(ClaimValidation.adminDecide),
  ClaimController.adminDecide,
);

router.use('/admin', admin);

router.use(requireAuth());

router.get('/mine/:restaurantId', ClaimController.mine);

router.post(
  '/',
  validateRequest(ClaimValidation.start),
  ClaimController.start,
);

router.post(
  '/suggest',
  validateRequest(ClaimValidation.suggest),
  ClaimController.suggest,
);

router.post(
  '/:id/code',
  validateRequest(ClaimValidation.sendCode),
  ClaimController.issueCode,
);

router.post(
  '/:id/verify',
  validateRequest(ClaimValidation.verify),
  ClaimController.verify,
);

router.post(
  '/:id/manual',
  validateRequest(ClaimValidation.manual),
  ClaimController.requestManual,
);

export const ClaimRoutes = router;
