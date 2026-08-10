import { StatusCodes } from 'http-status-codes';
import type { Request, Response } from 'express';

import catchAsync from '../../../shared/catchAsync';
import getQuery from '../../../shared/getQuery';
import sendResponse from '../../../shared/sendResponse';

import { EventService } from './event.service';
import type {
  AdminListEventQuery,
  ListEventQuery,
} from './event.validation';

const list = catchAsync(async (req: Request, res: Response) => {
  const data = await EventService.listPublic(getQuery<ListEventQuery>(req));
  sendResponse(res, { message: 'Events retrieved', data });
});

const listForAdmin = catchAsync(async (req: Request, res: Response) => {
  const data = await EventService.listForAdmin(
    getQuery<AdminListEventQuery>(req),
  );
  sendResponse(res, { message: 'Events retrieved', data });
});

const getOne = catchAsync(async (req: Request, res: Response) => {
  const data = await EventService.getById(req.params.id as string);
  sendResponse(res, { message: 'Event retrieved', data });
});

const create = catchAsync(async (req: Request, res: Response) => {
  const data = await EventService.create(req.body);
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Event created',
    data,
  });
});

const update = catchAsync(async (req: Request, res: Response) => {
  const data = await EventService.update(req.params.id as string, req.body);
  sendResponse(res, { message: 'Event updated', data });
});

const remove = catchAsync(async (req: Request, res: Response) => {
  await EventService.remove(req.params.id as string);
  sendResponse(res, { message: 'Event deleted', data: null });
});

export const EventController = {
  list,
  listForAdmin,
  getOne,
  create,
  update,
  remove,
};
