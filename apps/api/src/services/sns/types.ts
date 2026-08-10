/** 외부 API 응답을 진단하기 위한 최소 로거 (Fastify request.log 호환). */
export interface SnsLogger {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
}

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  platformUserId: string;
  platformUsername: string;
  /** instagram: BUSINESS | CREATOR | PERSONAL */
  accountType?: string;
}

export interface UploadResult {
  postId: string;
  /**
   * 플랫폼 쪽 처리가 시간 내에 끝나지 않았으면 'pending'.
   * (틱톡은 영상을 자기 서버로 내려받아 게시하므로 즉시 끝나지 않는다.)
   * 미지정이면 'success' 로 본다.
   */
  status?: 'success' | 'pending';
  /**
   * 우리 쪽 전달은 끝났지만 **사용자가 플랫폼 앱에서 마무리해야** 실제로 게시되는 경우 true.
   * (틱톡 `video.upload` 받은함 모드 — 심사 통과 전에는 이 방식만 쓸 수 있다.)
   */
  requiresUserAction?: boolean;
}
