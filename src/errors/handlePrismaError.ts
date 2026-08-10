import { StatusCodes } from 'http-status-codes';

import { type Prisma } from '../generated/prisma/client';
import type { IErrorDetail, IErrorResponse } from '../interfaces/error';

export const handleKnownPrismaError = (
  error: Prisma.PrismaClientKnownRequestError,
): IErrorResponse => {
  const meta = (error.meta ?? {}) as {
    target?: string[] | string;
    field_name?: string;
    modelName?: string;
    cause?: string;
  };

  const targetFields = Array.isArray(meta.target)
    ? meta.target
    : typeof meta.target === 'string'
      ? [meta.target]
      : [];

  switch (error.code) {
    case 'P2002': {
      const fields = targetFields.length > 0 ? targetFields : ['record'];
      const errorDetails: IErrorDetail[] = fields.map((field) => ({
        path: field,
        message: `A record with this ${field} already exists`,
      }));

      return {
        statusCode: StatusCodes.CONFLICT,
        message: `Duplicate value for ${fields.join(', ')}`,
        errorDetails,
      };
    }

    case 'P2003': {
      const field = meta.field_name ?? 'relation';
      return {
        statusCode: StatusCodes.BAD_REQUEST,
        message: 'Related record does not exist',
        errorDetails: [
          {
            path: String(field).replace(/_fkey.*$/, ''),
            message: `The referenced ${field} does not exist`,
          },
        ],
      };
    }

    case 'P2014':
      return {
        statusCode: StatusCodes.BAD_REQUEST,
        message: 'Invalid relation in the request',
        errorDetails: [{ path: '', message: error.message }],
      };

    case 'P2025':
      return {
        statusCode: StatusCodes.NOT_FOUND,
        message: meta.cause ?? 'Record not found',
        errorDetails: [
          {
            path: '',
            message: meta.cause ?? 'The requested record does not exist',
          },
        ],
      };

    default:
      return {
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        message: 'Database request failed',
        errorDetails: [{ path: '', message: `Prisma error ${error.code}` }],
      };
  }
};

export const handlePrismaValidationError = (): IErrorResponse => ({
  statusCode: StatusCodes.BAD_REQUEST,
  message: 'Invalid data provided to the database query',
  errorDetails: [{ path: '', message: 'Invalid data provided' }],
});

export const handlePrismaInitializationError = (): IErrorResponse => ({
  statusCode: StatusCodes.SERVICE_UNAVAILABLE,
  message: 'Database connection failed',
  errorDetails: [{ path: '', message: 'Could not reach the database server' }],
});
