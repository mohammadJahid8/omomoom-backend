import type { Request } from 'express';

const getQuery = <T = Record<string, unknown>>(req: Request): T =>
  (req.validatedQuery ?? req.query) as T;

export default getQuery;
