import express from 'express';

import { requireRestaurantAccess } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';

import { StudioController } from './studio.controller';
import { StudioValidation } from './studio.validation';

const router = express.Router();

router.get(
  '/:restaurantId',
  requireRestaurantAccess('restaurantId'),
  StudioController.get,
);

router.patch(
  '/:restaurantId',
  requireRestaurantAccess('restaurantId'),
  validateRequest(StudioValidation.update),
  StudioController.update,
);

router.get(
  '/:restaurantId/photos',
  requireRestaurantAccess('restaurantId'),
  StudioController.listPhotos,
);

router.post(
  '/:restaurantId/photos',
  requireRestaurantAccess('restaurantId'),
  validateRequest(StudioValidation.photo),
  StudioController.addPhoto,
);

/** Before /photos/:photoId, or "order" would be read as an id. */
router.patch(
  '/:restaurantId/photos/order',
  requireRestaurantAccess('restaurantId'),
  validateRequest(StudioValidation.photoOrder),
  StudioController.reorderPhotos,
);

router.patch(
  '/:restaurantId/photos/:photoId',
  requireRestaurantAccess('restaurantId'),
  validateRequest(StudioValidation.photoPatch),
  StudioController.updatePhoto,
);

router.delete(
  '/:restaurantId/photos/:photoId',
  requireRestaurantAccess('restaurantId'),
  StudioController.removePhoto,
);

export const StudioRoutes = router;
