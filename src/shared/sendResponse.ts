import type { Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import type { IMeta, ISuccessResponse } from '../interfaces/common';

type SendResponseArgs<T> = {
  statusCode?: number;
  message: string;
  meta?: IMeta;
  data: T;
};

const sendResponse = <T>(
  res: Response,
  { statusCode = StatusCodes.OK, message, meta, data }: SendResponseArgs<T>,
): void => {
  const payload: ISuccessResponse<T> = {
    success: true,
    statusCode,
    message,
    ...(meta ? { meta } : {}),
    data,
  };

  res.status(statusCode).json(payload);
};

export default sendResponse;
