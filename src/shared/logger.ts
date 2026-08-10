import pino from 'pino';

import config from '../config';

const usePrettyOutput = (): boolean => {
  if (config.isProduction || process.env['VERCEL']) return false;

  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
};

const logger = pino({
  level: config.logLevel,
  base: undefined,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      'body.password',
    ],
    censor: '[redacted]',
  },
  transport: usePrettyOutput()
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'hostname,pid',
        },
      }
    : undefined,
});

export default logger;
