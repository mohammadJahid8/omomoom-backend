import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import type { IFailureResponse } from '../../interfaces/common';

const notFound = (req: Request, res: Response, _next: NextFunction): void => {
  const payload: IFailureResponse = {
    success: false,
    statusCode: StatusCodes.NOT_FOUND,
    message: 'Route not found',
    errorDetails: [
      {
        path: req.originalUrl,
        message: `Cannot ${req.method} ${req.originalUrl}`,
      },
    ],
  };

  res.status(StatusCodes.NOT_FOUND).json(payload);
};

export default notFound;
