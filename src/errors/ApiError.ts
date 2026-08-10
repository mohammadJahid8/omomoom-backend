import type { IErrorDetail } from '../interfaces/error';

class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errorDetails: IErrorDetail[];

  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    errorDetails: IErrorDetail[] = [],
    stack = '',
  ) {
    super(message);

    this.statusCode = statusCode;
    this.errorDetails = errorDetails;
    this.isOperational = true;
    this.name = 'ApiError';

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export default ApiError;
