import express, { type Request, type Response } from 'express';
import { z } from 'zod';

import { TagType } from '../../../generated/prisma/enums';
import catchAsync from '../../../shared/catchAsync';
import getQuery from '../../../shared/getQuery';
import sendResponse from '../../../shared/sendResponse';
import validateRequest from '../../middlewares/validateRequest';

import { TaxonomyService } from './taxonomy.service';

const router = express.Router();

const getTagsSchema = z.object({
  query: z.object({
    type: z.enum(Object.keys(TagType) as [string, ...string[]]).optional(),
  }),
});

router.get(
  '/tags',
  validateRequest(getTagsSchema),
  catchAsync(async (req: Request, res: Response) => {
    const { type } = getQuery<{ type?: TagType }>(req);
    const data = await TaxonomyService.getTags(type);

    sendResponse(res, { message: 'Tags retrieved successfully', data });
  }),
);

router.get(
  '/neighborhoods',
  catchAsync(async (_req: Request, res: Response) => {
    const data = await TaxonomyService.getNeighborhoods();

    sendResponse(res, {
      message: 'Neighborhoods retrieved successfully',
      data,
    });
  }),
);

router.get(
  '/cities',
  catchAsync(async (_req: Request, res: Response) => {
    const data = await TaxonomyService.getCities();

    sendResponse(res, { message: 'Cities retrieved successfully', data });
  }),
);

export const TaxonomyRoutes = router;
