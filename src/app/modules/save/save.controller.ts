import type { Request, Response } from 'express';

import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';

import { SaveService } from './save.service';

const listMine = catchAsync(async (req: Request, res: Response) => {
  const data = await SaveService.listMine(req.user!.id);
  sendResponse(res, { message: 'Saved restaurants retrieved', data });
});

const save = catchAsync(async (req: Request, res: Response) => {
  const data = await SaveService.save(req.user!.id, req.body.restaurantId);
  sendResponse(res, { message: 'Saved', data });
});

const unsave = catchAsync(async (req: Request, res: Response) => {
  const data = await SaveService.unsave(
    req.user!.id,
    req.params.restaurantId as string,
  );
  sendResponse(res, { message: 'Removed', data });
});

const statusFor = catchAsync(async (req: Request, res: Response) => {
  const ids = String(req.query.ids ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const data = ids.length
    ? await SaveService.savedIdsAmong(req.user!.id, ids.slice(0, 100))
    : await SaveService.allSavedIds(req.user!.id);

  sendResponse(res, { message: 'Saved state retrieved', data });
});

export const SaveController = { listMine, save, unsave, statusFor };
