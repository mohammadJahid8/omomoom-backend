export const RESTAURANT_FILTER_FIELDS = [
  'q',
  'cuisine',
  'area',
  'price',
  'dish',
  'feature',
  'occasion',
  'dietary',
  'michelin',
  'claimed',
] as const;

export const RESTAURANT_SORT_FIELDS = [
  'featured',
  'name',
  'rating',
  'newest',
] as const;

export type RestaurantSort = (typeof RESTAURANT_SORT_FIELDS)[number];

export const FACETED_TAG_TYPES = [
  'CUISINE',
  'DISH',
  'OCCASION',
  'DIETARY',
] as const;
