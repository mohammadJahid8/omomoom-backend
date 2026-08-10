import type { IMeta, IPaginatedResult } from '../interfaces/common';
import type {
  IPaginationOptions,
  IPaginationResult,
  SortOrder,
} from '../interfaces/pagination';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

const MAX_LIMIT = 100;

const calculatePagination = (
  options: IPaginationOptions,
  allowedSortFields: readonly string[] = ['createdAt'],
): IPaginationResult => {
  const page = Math.max(Number(options.page) || DEFAULT_PAGE, 1);
  const limit = Math.min(
    Math.max(Number(options.limit) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );
  const skip = (page - 1) * limit;

  const requestedSortBy = options.sortBy ?? '';
  const sortBy = allowedSortFields.includes(requestedSortBy)
    ? requestedSortBy
    : (allowedSortFields[0] ?? 'createdAt');

  const sortOrder: SortOrder = options.sortOrder === 'asc' ? 'asc' : 'desc';

  return { page, limit, skip, sortBy, sortOrder };
};

const buildMeta = (page: number, limit: number, total: number): IMeta => {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

const paginate = <T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
): IPaginatedResult<T> => ({
  meta: buildMeta(page, limit, total),
  data,
});

export const paginationHelpers = {
  calculatePagination,
  buildMeta,
  paginate,
};
