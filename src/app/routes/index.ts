import express, { type Router } from 'express';

import { AiRoutes } from '../modules/ai/ai.route';
import { AuthRoutes } from '../modules/auth/auth.route';
import { EventRoutes } from '../modules/event/event.route';
import { HealthRoutes } from '../modules/health/health.route';
import { RestaurantRoutes } from '../modules/restaurant/restaurant.route';
import { TaxonomyRoutes } from '../modules/taxonomy/taxonomy.route';

const router = express.Router();

const moduleRoutes: { path: string; route: Router }[] = [
  { path: '/health', route: HealthRoutes },
  { path: '/auth', route: AuthRoutes },
  { path: '/ai', route: AiRoutes },
  { path: '/events', route: EventRoutes },
  { path: '/restaurants', route: RestaurantRoutes },

  { path: '/', route: TaxonomyRoutes },
];

moduleRoutes.forEach(({ path, route }) => router.use(path, route));

export default router;
