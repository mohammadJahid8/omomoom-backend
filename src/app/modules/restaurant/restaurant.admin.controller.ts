import { StatusCodes } from 'http-status-codes';
import type { Request, Response } from 'express';

import catchAsync from '../../../shared/catchAsync';
import getQuery from '../../../shared/getQuery';
import sendResponse from '../../../shared/sendResponse';

import { RestaurantAdminService } from './restaurant.admin.service';
import type { AdminRestaurantQuery } from './restaurant.admin.validation';

const list = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await RestaurantAdminService.list(
    getQuery<AdminRestaurantQuery>(req),
  );

  sendResponse(res, { message: 'Restaurants retrieved', meta, data });
});

const getOne = catchAsync(async (req: Request, res: Response) => {
  const data = await RestaurantAdminService.getById(req.params.id as string);
  sendResponse(res, { message: 'Restaurant retrieved', data });
});

const create = catchAsync(async (req: Request, res: Response) => {
  const data = await RestaurantAdminService.create(req.body);
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Restaurant created',
    data,
  });
});

const update = catchAsync(async (req: Request, res: Response) => {
  const data = await RestaurantAdminService.update(
    req.params.id as string,
    req.body,
  );
  sendResponse(res, { message: 'Restaurant updated', data });
});

const remove = catchAsync(async (req: Request, res: Response) => {
  await RestaurantAdminService.remove(req.params.id as string);
  sendResponse(res, { message: 'Restaurant deleted', data: null });
});

export const RestaurantAdminController = {
  list,
  getOne,
  create,
  update,
  remove,
};
