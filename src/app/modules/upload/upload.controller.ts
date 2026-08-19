import type { Request, Response } from 'express';

import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';

import { UploadService } from './upload.service';

const sign = catchAsync(async (req: Request, res: Response) => {
  const data = await UploadService.sign(req.user!, req.body);
  sendResponse(res, { message: 'Upload authorised', data });
});

export const UploadController = { sign };
