import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, {
  type Application,
  type Request,
  type Response,
} from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import globalErrorHandler from './app/middlewares/globalErrorHandler';
import notFound from './app/middlewares/notFound';
import requestLogger from './app/middlewares/requestLogger';
import { handleStripeWebhook } from './app/modules/webhook/stripe.webhook';
import routes from './app/routes';
import config from './config';

const app: Application = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (config.corsOrigins.includes(origin)) return callback(null, true);

      if (
        config.isDevelopment &&
        /^https?:\/\/localhost(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
    exposedHeaders: ['x-request-id'],
  }),
);

/**
 * Before every body parser, and before the rate limiter.
 *
 * Stripe signs the exact bytes it sent, so this route needs the raw buffer:
 * once `express.json` has parsed and re-serialised it, the signature can never
 * match. It also has to sit ahead of the limiter, because a retry storm from
 * Stripe would otherwise be throttled into failure.
 */
app.post(
  `${config.apiPrefix}/webhooks/stripe`,
  express.raw({ type: 'application/json' }),
  handleStripeWebhook,
);

app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());

app.use(requestLogger);

app.use(
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      success: false,
      statusCode: 429,
      message: 'Too many requests, please try again later',
      errorDetails: [{ path: '', message: 'Rate limit exceeded' }],
    },
  }),
);

app.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'omomoom API is running',
    version: 'v1',
    docs: `${config.apiPrefix}/health`,
  });
});

app.use(config.apiPrefix, routes);

app.use(notFound);
app.use(globalErrorHandler);

export default app;
