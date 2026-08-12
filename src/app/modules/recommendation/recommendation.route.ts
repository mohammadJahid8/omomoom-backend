import express from 'express';

import { requireAuth } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';

import { RecommendationController } from './recommendation.controller';
import { RecommendationValidation } from './recommendation.validation';

const router = express.Router();

router.get(
  '/',
  validateRequest(RecommendationValidation.listForRestaurant),
  RecommendationController.listForRestaurant,
);

router.get(
  '/recent',
  validateRequest(RecommendationValidation.listRecent),
  RecommendationController.listRecent,
);

router.get('/mine', requireAuth(), RecommendationController.listMine);
router.get('/mine/stats', requireAuth(), RecommendationController.myStats);

router.post(
  '/',
  requireAuth(),
  validateRequest(RecommendationValidation.create),
  RecommendationController.create,
);

router.delete('/:id', requireAuth(), RecommendationController.remove);

export const RecommendationRoutes = router;
