import type { Request, Response } from 'express';

import catchAsync from '../../../shared/catchAsync';
import getQuery from '../../../shared/getQuery';
import sendResponse from '../../../shared/sendResponse';

import { UserService } from './user.service';
import type { ListUsersQuery } from './user.validation';

const list = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await UserService.list(getQuery<ListUsersQuery>(req));
  sendResponse(res, { message: 'Accounts retrieved', meta, data });
});

const update = catchAsync(async (req: Request, res: Response) => {
  const data = await UserService.update(
    req.user!,
    req.params.id as string,
    req.body,
  );
  sendResponse(res, { message: 'Account updated', data });
});

export const UserController = { list, update };
