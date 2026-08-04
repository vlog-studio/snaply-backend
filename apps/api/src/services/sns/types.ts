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
}
