import express from 'express';

import { requireAdmin } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';

import { UserController } from './user.controller';
import { UserValidation } from './user.validation';

const router = express.Router();

/**
 * Public, and deliberately registered before the admin guard below: a profile
 * is meant to be shareable with people who have no account at all.
 */
router.get('/profile/:username', UserController.publicProfile);

router.use(requireAdmin);

router.get('/', validateRequest(UserValidation.list), UserController.list);
router.patch(
  '/:id',
  validateRequest(UserValidation.update),
  UserController.update,
);

export const UserRoutes = router;
