import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';
import pinoHttp from 'pino-http';

import logger from '../../shared/logger';

const requestLogger: RequestHandler = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers['x-request-id'];
    const id =
      (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },

  autoLogging: {
    ignore: (req) => req.url === '/api/v1/health' || req.url === '/',
  },
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} ${res.statusCode}`,
});

export default requestLogger;
