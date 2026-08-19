import { StatusCodes } from 'http-status-codes';
import type { Request, Response } from 'express';

import catchAsync from '../../../shared/catchAsync';
import getQuery from '../../../shared/getQuery';
import sendResponse from '../../../shared/sendResponse';

import { ClaimAdminService } from './claim.admin.service';
import { ClaimService } from './claim.service';
import type { AdminListQuery } from './claim.validation';

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

const suggest = catchAsync(async (req: Request, res: Response) => {
  const data = await ClaimService.suggest(req.user!.id, req.body);
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Thanks, we will review it',
    data,
  });
});

const adminList = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await ClaimAdminService.list(
    getQuery<AdminListQuery>(req),
  );
  sendResponse(res, { message: 'Claims retrieved', meta, data });
});

const adminDecide = catchAsync(async (req: Request, res: Response) => {
  const data = await ClaimAdminService.decide(
    req.user!,
    req.params.id as string,
    req.body,
  );
  sendResponse(res, {
    message:
      req.body.action === 'APPROVE' ? 'Claim approved' : 'Claim rejected',
    data,
  });
});

const adminRevoke = catchAsync(async (req: Request, res: Response) => {
  const data = await ClaimAdminService.revoke(req.user!, req.body);
  sendResponse(res, { message: 'Ownership revoked', data });
});

export const ClaimController = {
  start,
  issueCode,
  verify,
  requestManual,
  mine,
  suggest,
  adminList,
  adminDecide,
  adminRevoke,
};
