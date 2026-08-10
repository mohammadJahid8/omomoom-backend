export type IErrorDetail = {
  path: string | number;
  message: string;
};

export type IErrorResponse = {
  statusCode: number;
  message: string;
  errorDetails: IErrorDetail[];
};
