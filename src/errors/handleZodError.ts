import { StatusCodes } from 'http-status-codes';
import type { ZodError } from 'zod';

import type { IErrorResponse } from '../interfaces/error';

const handleZodError = (error: ZodError): IErrorResponse => {
  const errorDetails = error.issues.map((issue) => {
    const [section, ...rest] = issue.path;
    const relevantPath =
      ['body', 'query', 'params', 'cookies'].includes(String(section)) &&
      rest.length > 0
        ? rest
        : issue.path;

    return {
      path: relevantPath.join('.'),
      message: issue.message,
    };
  });

  return {
    statusCode: StatusCodes.BAD_REQUEST,
    message: 'Validation error',
    errorDetails,
  };
};

export default handleZodError;
