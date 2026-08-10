import express from 'express';

import { requireAdmin } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';

import { EventController } from './event.controller';
import { EventValidation } from './event.validation';

const router = express.Router();

router.get(
  '/',
  validateRequest(EventValidation.list),
  EventController.list,
);

router.get(
  '/admin',
  requireAdmin,
  validateRequest(EventValidation.adminList),
  EventController.listForAdmin,
);

router.post(
  '/',
  requireAdmin,
  validateRequest(EventValidation.create),
  EventController.create,
);

router.get('/:id', requireAdmin, EventController.getOne);

router.patch(
  '/:id',
  requireAdmin,
  validateRequest(EventValidation.update),
  EventController.update,
);

router.delete('/:id', requireAdmin, EventController.remove);

export const EventRoutes = router;
