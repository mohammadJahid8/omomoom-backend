import type { IErrorDetail } from './error';

export type IMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

export type IPaginatedResult<T> = {
  meta: IMeta;
  data: T[];
};

export type ISuccessResponse<T> = {
  success: true;
  statusCode: number;
  message: string;
  meta?: IMeta;
  data: T;
};

export type IFailureResponse = {
  success: false;
  statusCode: number;
  message: string;
  errorDetails: IErrorDetail[];
  stack?: string;
};
