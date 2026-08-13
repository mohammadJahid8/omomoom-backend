import express from 'express';

import { requireAdmin } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';

import { RestaurantAdminController } from './restaurant.admin.controller';
import { RestaurantAdminValidation } from './restaurant.admin.validation';
import { RestaurantController } from './restaurant.controller';
import { RestaurantValidation } from './restaurant.validation';

const router = express.Router();

router.get(
  '/',
  validateRequest(RestaurantValidation.getRestaurants),
  RestaurantController.getRestaurants,
);

// Admin routes sit above /:slug so a literal path is never read as a slug.
router.get(
  '/admin',
  requireAdmin,
  validateRequest(RestaurantAdminValidation.list),
  RestaurantAdminController.list,
);

router.post(
  '/admin',
  requireAdmin,
  validateRequest(RestaurantAdminValidation.create),
  RestaurantAdminController.create,
);

router.get('/admin/:id', requireAdmin, RestaurantAdminController.getOne);

router.patch(
  '/admin/:id',
  requireAdmin,
  validateRequest(RestaurantAdminValidation.update),
  RestaurantAdminController.update,
);

router.delete('/admin/:id', requireAdmin, RestaurantAdminController.remove);

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
