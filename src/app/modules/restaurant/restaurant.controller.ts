import type { Request, Response } from 'express';

import catchAsync from '../../../shared/catchAsync';
import getQuery from '../../../shared/getQuery';
import sendResponse from '../../../shared/sendResponse';

import type { RestaurantFilters } from './restaurant.interface';
import { RestaurantService } from './restaurant.service';
import type { GetRestaurantsQuery } from './restaurant.validation';

const getRestaurants = catchAsync(async (req: Request, res: Response) => {
  const { page, limit, sortBy, facets, ...filters } =
    getQuery<GetRestaurantsQuery>(req);

  const {
    meta,
    data,
    facets: facetOptions,
  } = await RestaurantService.getRestaurants(filters as RestaurantFilters, {
    page,
    limit,
    sortBy,
    facets,
  });

  sendResponse(res, {
    message: 'Restaurants retrieved successfully',
    meta,
    data: facetOptions
      ? { restaurants: data, facets: facetOptions }
      : { restaurants: data },
  });
});

const getRestaurantBySlug = catchAsync(async (req: Request, res: Response) => {
  const result = await RestaurantService.getRestaurantBySlug(
    req.params.slug as string,
  );

  sendResponse(res, {
    message: 'Restaurant retrieved successfully',
    data: result,
  });
});

const getRelatedRestaurants = catchAsync(
  async (req: Request, res: Response) => {
    const result = await RestaurantService.getRelatedRestaurants(
      req.params.slug as string,
    );

    sendResponse(res, {
      message: 'Related restaurants retrieved successfully',
      data: result,
    });
  },
);

export const RestaurantController = {
  getRestaurants,
  getRestaurantBySlug,
  getRelatedRestaurants,
};
