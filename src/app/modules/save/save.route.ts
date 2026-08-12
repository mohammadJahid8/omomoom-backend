import express from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';

import { SaveController } from './save.controller';

const router = express.Router();

const saveBody = z.object({
  body: z.object({ restaurantId: z.uuid() }),
});

router.use(requireAuth());

router.get('/', SaveController.listMine);
router.get('/status', SaveController.statusFor);
router.post('/', validateRequest(saveBody), SaveController.save);
router.delete('/:restaurantId', SaveController.unsave);

export const SaveRoutes = router;
