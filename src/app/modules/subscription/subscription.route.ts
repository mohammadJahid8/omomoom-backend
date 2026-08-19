import express from 'express';

import { requireAuth } from '../../middlewares/auth';

import { SubscriptionController } from './subscription.controller';

const router = express.Router();

router.use(requireAuth());

router.get('/:restaurantId', SubscriptionController.statusFor);
router.post('/:restaurantId', SubscriptionController.start);
router.delete('/:restaurantId', SubscriptionController.cancel);

export const SubscriptionRoutes = router;
