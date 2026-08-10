import type { Server } from 'node:http';

import app from './app';
import config from './config';
import logger from './shared/logger';
import prisma from './shared/prisma';

let server: Server | undefined;

async function bootstrap(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('🛢  Database connected');
  } catch (error) {
    logger.fatal({ err: error }, '❌ Failed to connect to the database');
    process.exit(1);
  }

  server = app.listen(config.port, () => {
    logger.info(
      `🚀 Server listening on http://localhost:${config.port} [${config.env}]`,
    );
    logger.info(
      `   Health check: http://localhost:${config.port}${config.apiPrefix}/health`,
    );
  });
}

const shutdown = async (signal: string): Promise<void> => {
  logger.info(`${signal} received, shutting down gracefully...`);

  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  }

  await prisma.$disconnect();
  logger.info('Shutdown complete');
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  if (server) {
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

void bootstrap();
