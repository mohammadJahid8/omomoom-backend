import type { Request, Response } from 'express';

import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';

import { StudioPhotoService } from './studio.photo.service';
import { StudioService } from './studio.service';

const get = catchAsync(async (req: Request, res: Response) => {
  const data = await StudioService.get(req.params.restaurantId as string);
  sendResponse(res, { message: 'Listing retrieved', data });
});

const update = catchAsync(async (req: Request, res: Response) => {
  const data = await StudioService.update(
    req.params.restaurantId as string,
    req.body,
  );
  sendResponse(res, { message: 'Saved', data });
});

const listPhotos = catchAsync(async (req: Request, res: Response) => {
  const data = await StudioPhotoService.list(req.params.restaurantId as string);
  sendResponse(res, { message: 'Photos retrieved', data });
});

const addPhoto = catchAsync(async (req: Request, res: Response) => {
  const data = await StudioPhotoService.add(
    req.user!,
    req.params.restaurantId as string,
    req.body,
  );
  sendResponse(res, { message: 'Photo added', data });
});

const updatePhoto = catchAsync(async (req: Request, res: Response) => {
  const data = await StudioPhotoService.update(
    req.params.restaurantId as string,
    req.params.photoId as string,
    req.body,
  );
  sendResponse(res, { message: 'Photo updated', data });
});

const removePhoto = catchAsync(async (req: Request, res: Response) => {
  const data = await StudioPhotoService.remove(
    req.params.restaurantId as string,
    req.params.photoId as string,
  );
  sendResponse(res, { message: 'Photo removed', data });
});

const reorderPhotos = catchAsync(async (req: Request, res: Response) => {
  const data = await StudioPhotoService.reorder(
    req.params.restaurantId as string,
    req.body,
  );
  sendResponse(res, { message: 'Order saved', data });
});

export const StudioController = {
  get,
  update,
  listPhotos,
  addPhoto,
  updatePhoto,
  removePhoto,
  reorderPhotos,
};
