import express, { type Router } from 'express';

import { AiRoutes } from '../modules/ai/ai.route';
import { AuthRoutes } from '../modules/auth/auth.route';
import { EventRoutes } from '../modules/event/event.route';
import { HealthRoutes } from '../modules/health/health.route';
import { RecommendationRoutes } from '../modules/recommendation/recommendation.route';
import { RestaurantRoutes } from '../modules/restaurant/restaurant.route';
import { SaveRoutes } from '../modules/save/save.route';
import { UserRoutes } from '../modules/user/user.route';
import { TaxonomyRoutes } from '../modules/taxonomy/taxonomy.route';

const router = express.Router();

const moduleRoutes: { path: string; route: Router }[] = [
  { path: '/health', route: HealthRoutes },
  { path: '/auth', route: AuthRoutes },
  { path: '/ai', route: AiRoutes },
  { path: '/events', route: EventRoutes },
  { path: '/recommendations', route: RecommendationRoutes },
  { path: '/saves', route: SaveRoutes },
  { path: '/restaurants', route: RestaurantRoutes },
  { path: '/users', route: UserRoutes },

  { path: '/', route: TaxonomyRoutes },
];

moduleRoutes.forEach(({ path, route }) => router.use(path, route));

export default router;
