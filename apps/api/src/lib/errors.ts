/** API 전역에서 던지는 커스텀 에러. statusCode/code가 응답 포맷에 그대로 반영된다. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }

  static unauthorized(message = '인증이 필요합니다.'): AppError {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = '권한이 없습니다.'): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = '요청한 리소스를 찾을 수 없습니다.'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static badRequest(message = '잘못된 요청입니다.'): AppError {
    return new AppError(400, 'BAD_REQUEST', message);
  }
}
