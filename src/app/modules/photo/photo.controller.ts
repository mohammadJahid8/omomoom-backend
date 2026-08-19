import type { Request, Response } from 'express';

import catchAsync from '../../../shared/catchAsync';
import getQuery from '../../../shared/getQuery';
import sendResponse from '../../../shared/sendResponse';

import { PhotoService } from './photo.service';
import type { QueueQuery } from './photo.validation';

const mine = catchAsync(async (req: Request, res: Response) => {
  const data = await PhotoService.mine(req.user!.id);
  sendResponse(res, { message: 'Photos retrieved', data });
});

const withdraw = catchAsync(async (req: Request, res: Response) => {
  const data = await PhotoService.withdraw(
    req.user!.id,
    req.params.id as string,
  );
  sendResponse(res, { message: 'Photo removed', data });
});

const queue = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await PhotoService.queue(getQuery<QueueQuery>(req));
  sendResponse(res, { message: 'Queue retrieved', meta, data });
});

const decide = catchAsync(async (req: Request, res: Response) => {
  const data = await PhotoService.decide(
    req.user!,
    req.params.id as string,
    req.body,
  );
  sendResponse(res, {
    message: req.body.action === 'APPROVE' ? 'Photo approved' : 'Photo rejected',
    data,
  });
});

export const PhotoController = { mine, withdraw, queue, decide };
