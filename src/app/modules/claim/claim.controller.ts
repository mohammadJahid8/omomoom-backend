import { StatusCodes } from 'http-status-codes';
import type { Request, Response } from 'express';

import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';

import { ClaimService } from './claim.service';

const start = catchAsync(async (req: Request, res: Response) => {
  const data = await ClaimService.start(req.user!.id, req.body);
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Claim started',
    data,
  });
});

const issueCode = catchAsync(async (req: Request, res: Response) => {
  const data = await ClaimService.issueCode(
    req.user!.id,
    req.params.id as string,
    req.body,
  );
  sendResponse(res, { message: 'Code sent', data });
});

const verify = catchAsync(async (req: Request, res: Response) => {
  const data = await ClaimService.verify(
    req.user!.id,
    req.params.id as string,
    req.body,
  );
  sendResponse(res, { message: 'Verified', data });
});

const requestManual = catchAsync(async (req: Request, res: Response) => {
  const data = await ClaimService.requestManual(
    req.user!.id,
    req.params.id as string,
    req.body,
  );
  sendResponse(res, { message: 'Sent for review', data });
});

const mine = catchAsync(async (req: Request, res: Response) => {
  const data = await ClaimService.mineFor(
    req.user!.id,
    req.params.restaurantId as string,
  );
  sendResponse(res, { message: 'Claim retrieved', data });
});

export const ClaimController = { start, issueCode, verify, requestManual, mine };
