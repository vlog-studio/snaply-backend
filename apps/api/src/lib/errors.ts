/** API 전역에서 던지는 커스텀 에러. statusCode/code가 응답 포맷에 그대로 반영된다. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  /**
   * 에러 응답에 함께 실을 구조화된 부가 정보. 에러 핸들러가 `error` 객체에 병합하므로,
   * 실어 보내는 키는 해당 상태 코드의 응답 스키마에 선언돼 있어야 한다
   * (선언 안 된 키는 직렬화에서 조용히 사라진다 — shared-types 의 `apiErrorWith` 로 선언한다).
   */
  readonly details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
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

  static conflict(message = '현재 상태에서는 수행할 수 없는 요청입니다.'): AppError {
    return new AppError(409, 'CONFLICT', message);
  }
}
