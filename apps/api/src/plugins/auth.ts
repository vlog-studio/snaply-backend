import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose';
import type { AppConfig } from '../config.js';
import { AppError } from '../lib/errors.js';
import { purgeAfterFor } from '../services/account.service.js';
import { resolveUser, type AuthUser } from '../services/user.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
  interface FastifyInstance {
    /** 라우트에 preHandler로 붙이면 인증을 강제한다. 삭제 대기 중인 계정은 403. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** 삭제 대기 중인 계정도 통과시키는 인증 — 계정 복구 라우트 전용. */
    authenticateAllowDeleted: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/** Authorization: Bearer 헤더 우선, 없으면 쿼리 파라미터 token (WebSocket 대비). */
function extractToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  const queryToken = (request.query as { token?: unknown } | undefined)?.token;
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }
  return null;
}

async function authPluginImpl(app: FastifyInstance, config: AppConfig): Promise<void> {
  // JWKS는 원격에서 한 번 로드 후 캐시되며, 키 회전 시 자동 갱신된다.
  const jwks = createRemoteJWKSet(new URL(config.jwksUrl));

  const authenticateAllowDeleted = async (request: FastifyRequest): Promise<void> => {
    const token = extractToken(request);
    if (!token) {
      throw AppError.unauthorized('인증 토큰이 없습니다.');
    }

    let supabaseUid: string;
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.jwtIssuer,
        audience: config.jwtAudience,
        algorithms: ['ES256'],
      });
      if (!payload.sub) {
        throw AppError.unauthorized('토큰에 사용자 식별자가 없습니다.');
      }
      supabaseUid = payload.sub;
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      if (
        err instanceof joseErrors.JWTExpired ||
        err instanceof joseErrors.JWTInvalid ||
        err instanceof joseErrors.JWSSignatureVerificationFailed ||
        err instanceof joseErrors.JWTClaimValidationFailed
      ) {
        throw AppError.unauthorized('유효하지 않은 토큰입니다.');
      }
      request.log.error(err, 'JWT 검증 중 예기치 못한 오류');
      throw AppError.unauthorized('토큰 검증에 실패했습니다.');
    }

    request.user = await resolveUser(supabaseUid);
  };

  const authenticate = async (request: FastifyRequest): Promise<void> => {
    await authenticateAllowDeleted(request);
    if (request.user.deletedAt) {
      // 복구 가능한 기한을 앱이 그대로 보여줄 수 있게 실삭제 예정 시각을 함께 내린다.
      throw new AppError(
        403,
        'ACCOUNT_PENDING_DELETION',
        '삭제 대기 중인 계정입니다. 복구하려면 POST /auth/me/restore 를 호출하세요.',
        { purgeAfter: purgeAfterFor(request.user.deletedAt).toISOString() },
      );
    }
  };

  app.decorateRequest('user', null);
  app.decorate('authenticate', authenticate);
  app.decorate('authenticateAllowDeleted', authenticateAllowDeleted);
}

export const authPlugin = fp(authPluginImpl, { name: 'auth' });
