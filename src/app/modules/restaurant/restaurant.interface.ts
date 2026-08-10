import type { GetRestaurantsQuery } from './restaurant.validation';

export type RestaurantFilters = Omit<
  GetRestaurantsQuery,
  'page' | 'limit' | 'sortBy' | 'facets'
>;

export type FacetOption = {
  slug: string;
  label: string;

  count: number;
  emoji?: string | null;

  code?: string | null;
};

export type RestaurantFacets = {
  cuisine: FacetOption[];
  area: FacetOption[];
  price: FacetOption[];
  dish: FacetOption[];
  occasion: FacetOption[];
  dietary: FacetOption[];
};
