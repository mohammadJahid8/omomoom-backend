import type { Request, Response } from 'express';

import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';

import { SubscriptionService } from './subscription.service';

const statusFor = catchAsync(async (req: Request, res: Response) => {
  const data = await SubscriptionService.statusFor(
    req.user!,
    req.params.restaurantId as string,
  );
  sendResponse(res, { message: 'Subscription retrieved', data });
});

const start = catchAsync(async (req: Request, res: Response) => {
  const data = await SubscriptionService.start(
    req.user!,
    req.params.restaurantId as string,
  );
  sendResponse(res, { message: 'Subscription started', data });
});

const cancel = catchAsync(async (req: Request, res: Response) => {
  const data = await SubscriptionService.cancel(
    req.user!,
    req.params.restaurantId as string,
  );
  sendResponse(res, { message: 'Subscription cancelled', data });
});

export const SubscriptionController = { statusFor, start, cancel };
