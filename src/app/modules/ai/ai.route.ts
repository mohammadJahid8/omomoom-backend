import express, { type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import validateRequest from '../../middlewares/validateRequest';

import { AiService } from './ai.service';

const router = express.Router();

const parseQuerySchema = z.object({
  body: z.object({
    q: z
      .string({ error: 'A search phrase is required' })
      .trim()
      .min(2, 'Say a little more than that')
      .max(200, 'Keep it under 200 characters'),
  }),
});

const aiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many AI searches. Give it a minute.',
    errorDetails: [{ path: '', message: 'Rate limit exceeded' }],
  },
});

router.post(
  '/search',
  aiRateLimit,
  validateRequest(parseQuerySchema),
  catchAsync(async (req: Request, res: Response) => {
    const { q } = req.body as { q: string };
    const result = await AiService.parseQuery(q);

    sendResponse(res, {
      message: result.usedAi
        ? 'Query interpreted successfully'
        : 'Falling back to text search',
      data: result,
    });
  }),
);

export const AiRoutes = router;
