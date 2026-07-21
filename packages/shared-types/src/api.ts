/** 모든 API 응답의 공통 포맷: `{ success: true, data }` 또는 `{ success: false, error }` */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface CursorPaginated<T> {
  items: T[];
  nextCursor: string | null;
}
