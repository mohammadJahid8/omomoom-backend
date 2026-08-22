import express from 'express';

import { requireAuth } from '../../middlewares/auth';

import { SubscriptionController } from './subscription.controller';

const router = express.Router();

router.use(requireAuth());

router.get('/:restaurantId', SubscriptionController.statusFor);
router.post('/:restaurantId', SubscriptionController.start);
router.delete('/:restaurantId', SubscriptionController.cancel);
router.post('/:restaurantId/resume', SubscriptionController.resume);
router.post('/:restaurantId/portal', SubscriptionController.billingPortal);

export const SubscriptionRoutes = router;
