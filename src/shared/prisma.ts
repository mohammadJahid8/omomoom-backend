import { PrismaPg } from '@prisma/adapter-pg';

import config from '../config';
import { PrismaClient } from '../generated/prisma/client';

import logger from './logger';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const createPrismaClient = () => {
  const adapter = new PrismaPg({ connectionString: config.databaseUrl });

  const client = new PrismaClient({
    adapter,
    log: config.isDevelopment
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ]
      : [
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ],
  });

  if (config.isDevelopment) {
    client.$on('query', (event) => {
      logger.debug({ query: event.query, duration: `${event.duration}ms` });
    });
  }

  client.$on('warn', (event) => logger.warn({ prisma: event.message }));
  client.$on('error', (event) => logger.error({ prisma: event.message }));

  return client;
};

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (!config.isProduction) {
  globalForPrisma.prisma = prisma;
}

export default prisma;
