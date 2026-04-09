export type ApiResponse<T> = {
  data: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
};

export type ApiError = {
  error: string;
  details?: unknown;
};

export type PaginationParams = {
  page?: number;
  limit?: number;
};
