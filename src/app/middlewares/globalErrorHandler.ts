import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from 'express';
import { StatusCodes } from 'http-status-codes';
import { ZodError } from 'zod';

import config from '../../config';
import ApiError from '../../errors/ApiError';
import {
  handleKnownPrismaError,
  handlePrismaInitializationError,
  handlePrismaValidationError,
} from '../../errors/handlePrismaError';
import handleZodError from '../../errors/handleZodError';
import { Prisma } from '../../generated/prisma/client';
import type { IFailureResponse } from '../../interfaces/common';
import type { IErrorDetail } from '../../interfaces/error';
import logger from '../../shared/logger';

const globalErrorHandler: ErrorRequestHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  let statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR;
  let message = 'Something went wrong';
  let errorDetails: IErrorDetail[] = [];

  if (error instanceof ZodError) {
    const simplified = handleZodError(error);
    statusCode = simplified.statusCode;
    message = simplified.message;
    errorDetails = simplified.errorDetails;
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const simplified = handleKnownPrismaError(error);
    statusCode = simplified.statusCode;
    message = simplified.message;
    errorDetails = simplified.errorDetails;
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    const simplified = handlePrismaValidationError();
    statusCode = simplified.statusCode;
    message = simplified.message;
    errorDetails = simplified.errorDetails;
  } else if (error instanceof Prisma.PrismaClientInitializationError) {
    const simplified = handlePrismaInitializationError();
    statusCode = simplified.statusCode;
    message = simplified.message;
    errorDetails = simplified.errorDetails;
  } else if (error instanceof ApiError) {
    statusCode = error.statusCode;
    message = error.message;
    errorDetails =
      error.errorDetails.length > 0
        ? error.errorDetails
        : [{ path: '', message: error.message }];
  } else if (error instanceof SyntaxError && 'body' in error) {
    statusCode = StatusCodes.BAD_REQUEST;
    message = 'Malformed JSON in request body';
    errorDetails = [{ path: '', message: 'Request body is not valid JSON' }];
  } else if (error instanceof Error) {
    message = config.isProduction ? 'Internal server error' : error.message;
    errorDetails = [{ path: '', message }];
  }

  const logPayload = {
    err: error,
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    statusCode,
  };

  if (statusCode >= StatusCodes.INTERNAL_SERVER_ERROR) {
    logger.error(logPayload, message);
  } else {
    logger.warn(logPayload, message);
  }

  const payload: IFailureResponse = {
    success: false,
    statusCode,
    message,
    errorDetails,
    ...(config.isProduction
      ? {}
      : { stack: error instanceof Error ? error.stack : undefined }),
  };

  res.status(statusCode).json(payload);
};

export default globalErrorHandler;
