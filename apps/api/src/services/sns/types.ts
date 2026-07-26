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
}
