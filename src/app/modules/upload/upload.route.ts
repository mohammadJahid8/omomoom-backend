import express from 'express';

import { requireAuth } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';

import { UploadController } from './upload.controller';
import { UploadValidation } from './upload.validation';

const router = express.Router();

router.post(
  '/sign',
  requireAuth(),
  validateRequest(UploadValidation.sign),
  UploadController.sign,
);

export const UploadRoutes = router;
