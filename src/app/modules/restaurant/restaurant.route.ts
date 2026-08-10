import express from 'express';

import validateRequest from '../../middlewares/validateRequest';

import { RestaurantController } from './restaurant.controller';
import { RestaurantValidation } from './restaurant.validation';

const router = express.Router();

router.get(
  '/',
  validateRequest(RestaurantValidation.getRestaurants),
  RestaurantController.getRestaurants,
);

router.get(
  '/:slug/related',
  validateRequest(RestaurantValidation.getRestaurantBySlug),
  RestaurantController.getRelatedRestaurants,
);

router.get(
  '/:slug',
  validateRequest(RestaurantValidation.getRestaurantBySlug),
  RestaurantController.getRestaurantBySlug,
);

export const RestaurantRoutes = router;
