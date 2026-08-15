import express from 'express';

import { requireAuth } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';

import { ClaimController } from './claim.controller';
import { ClaimValidation } from './claim.validation';

const router = express.Router();

router.use(requireAuth());

router.get('/mine/:restaurantId', ClaimController.mine);

router.post(
  '/',
  validateRequest(ClaimValidation.start),
  ClaimController.start,
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
