import express from 'express';

import { requireAdmin, requireAuth } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';

import { PhotoController } from './photo.controller';
import { PhotoValidation } from './photo.validation';

const router = express.Router();

/** Before the member routes, or "moderation" would be read as a photo id. */
router.get(
  '/moderation',
  requireAdmin,
  validateRequest(PhotoValidation.queue),
  PhotoController.queue,
);

router.patch(
  '/moderation/:id',
  requireAdmin,
  validateRequest(PhotoValidation.decide),
  PhotoController.decide,
);

router.get('/mine', requireAuth(), PhotoController.mine);

router.delete('/:id', requireAuth(), PhotoController.withdraw);

export const PhotoRoutes = router;
