import express, { type Request, type Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import catchAsync from '../../../shared/catchAsync';
import prisma from '../../../shared/prisma';
import sendResponse from '../../../shared/sendResponse';

const router = express.Router();

router.get(
  '/',
  catchAsync(async (_req: Request, res: Response) => {
    const startedAt = process.hrtime.bigint();
    let database: 'up' | 'down' = 'up';
    let latencyMs: number | null = null;

    try {
      await prisma.$queryRaw`SELECT 1`;
      latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    } catch {
      database = 'down';
    }

    sendResponse(res, {
      statusCode:
        database === 'up' ? StatusCodes.OK : StatusCodes.SERVICE_UNAVAILABLE,
      message:
        database === 'up' ? 'Service is healthy' : 'Database is unreachable',
      data: {
        status: database === 'up' ? 'ok' : 'degraded',
        database,
        databaseLatencyMs:
          latencyMs === null ? null : Number(latencyMs.toFixed(2)),
        uptimeSeconds: Number(process.uptime().toFixed(0)),
        timestamp: new Date().toISOString(),
      },
    });
  }),
);

export const HealthRoutes = router;
