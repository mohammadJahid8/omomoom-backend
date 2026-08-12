import { StatusCodes } from 'http-status-codes';
import type { Request, Response } from 'express';

import catchAsync from '../../../shared/catchAsync';
import getQuery from '../../../shared/getQuery';
import sendResponse from '../../../shared/sendResponse';

import { RecommendationService } from './recommendation.service';
import type {
  ListForRestaurantQuery,
  ListRecentQuery,
} from './recommendation.validation';

const create = catchAsync(async (req: Request, res: Response) => {
  const data = await RecommendationService.create(req.user!.id, req.body);
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Thanks for the recommendation',
    data,
  });
});

const remove = catchAsync(async (req: Request, res: Response) => {
  await RecommendationService.remove(req.user!, req.params.id as string);
  sendResponse(res, { message: 'Recommendation removed', data: null });
});

const listForRestaurant = catchAsync(async (req: Request, res: Response) => {
  const data = await RecommendationService.listForRestaurant(
    getQuery<ListForRestaurantQuery>(req),
  );
  sendResponse(res, { message: 'Recommendations retrieved', data });
});

const listRecent = catchAsync(async (req: Request, res: Response) => {
  const data = await RecommendationService.listRecent(
    getQuery<ListRecentQuery>(req),
  );
  sendResponse(res, { message: 'Recommendations retrieved', data });
});

const listMine = catchAsync(async (req: Request, res: Response) => {
  const data = await RecommendationService.listForUser(req.user!.id);
  sendResponse(res, { message: 'Your recommendations', data });
});

const myStats = catchAsync(async (req: Request, res: Response) => {
  const data = await RecommendationService.statsForUser(req.user!.id);
  sendResponse(res, { message: 'Your contribution counts', data });
});

export const RecommendationController = {
  create,
  remove,
  listForRestaurant,
  listRecent,
  listMine,
  myStats,
};
