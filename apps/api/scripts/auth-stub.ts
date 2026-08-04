/**
 * 로컬 개발/테스트용 Supabase Auth 스텁.
 *
 * Supabase Auth와 동일한 형태(ES256 + JWKS)로 토큰을 발급하므로 `plugins/auth.ts`는
 * 전혀 수정할 필요가 없다. `.env`의 SUPABASE_URL만 이 스텁을 가리키게 하면 되고,
 * 실제 Supabase로 전환할 땐 SUPABASE_URL을 원래 값으로 되돌리면 끝이다.
 *
 * 제공 엔드포인트 (Supabase 경로와 동일):
 *   GET  /auth/v1/.well-known/jwks.json   공개키(JWKS)
 *   POST /token?sub=<uuid>&email=<...>    토큰 발급 (스텁 전용 편의 엔드포인트)
 *
 * 사용:
 *   npm run auth:stub -w apps/api        # :54321 기동 + 샘플 토큰 출력
 *   import { startAuthStub } from '.../auth-stub.js'   # 통합 테스트에서 사용
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT, calculateJwkThumbprint, type JWK } from 'jose';

const DEFAULT_PORT = 54321;

export interface MintClaims {
  sub?: string;
  email?: string;
  /** jose 형식의 만료 시간. 기본 '2h' */
  expiresIn?: string;
  /** 기본 'authenticated' — 잘못된 aud로 401을 검증할 때 사용. */
  audience?: string;
}

export interface AuthStub {
  /** SUPABASE_URL에 넣을 값 */
  url: string;
  issuer: string;
  port: number;
  mint: (claims?: MintClaims) => Promise<string>;
  /** 이미 만료된 토큰 — 401 검증용. */
  mintExpired: (sub?: string) => Promise<string>;
  close: () => Promise<void>;
}

/** ES256 키쌍을 생성하고 Supabase 호환 JWKS 서버를 띄운다. */
export async function startAuthStub(options: { port?: number } = {}): Promise<AuthStub> {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const publicJwk: JWK = await exportJWK(publicKey);
  const kid = await calculateJwkThumbprint(publicJwk);
  Object.assign(publicJwk, { kid, alg: 'ES256', use: 'sig' });

  let issuer = '';

  async function mint(claims: MintClaims = {}): Promise<string> {
    return new SignJWT({
      email: claims.email,
      role: 'authenticated',
      // Supabase가 넣어주는 부가 클레임 (현재 백엔드는 sub만 사용)
      app_metadata: { provider: 'email' },
      user_metadata: {},
    })
      .setProtectedHeader({ alg: 'ES256', kid })
      .setIssuer(issuer)
      .setAudience(claims.audience ?? 'authenticated')
      .setSubject(claims.sub ?? randomUUID())
      .setIssuedAt()
      .setExpirationTime(claims.expiresIn ?? '2h')
      .sign(privateKey);
  }

  async function mintExpired(sub: string = randomUUID()): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setSubject(sub)
      .setIssuedAt(now - 7200)
      .setExpirationTime(now - 3600)
      .sign(privateKey);
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/auth/v1/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }

    if (url.pathname === '/token') {
      const sub = url.searchParams.get('sub') ?? randomUUID();
      const email = url.searchParams.get('email') ?? undefined;
      void mint({ sub, email })
        .then((token) => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ access_token: token, sub, email }));
        })
        .catch(() => res.writeHead(500).end());
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('auth 스텁 서버 주소를 확인할 수 없습니다.');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  issuer = `${baseUrl}/auth/v1`;

  return {
    url: baseUrl,
    issuer,
    port: address.port,
    mint,
    mintExpired,
    close: () => new Promise<void>((resolve) => void server.close(() => resolve())),
  };
}

// CLI 모드: 스텁을 띄우고 바로 쓸 수 있는 토큰을 출력한다.
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const stub = await startAuthStub({ port: Number(process.env.AUTH_STUB_PORT ?? DEFAULT_PORT) });
  const sub = process.env.AUTH_STUB_SUB ?? randomUUID();
  const email = process.env.AUTH_STUB_EMAIL ?? `dev+${sub.slice(0, 8)}@snaply.local`;
  const token = await stub.mint({ sub, email });

  console.log(`\n  Supabase Auth 스텁 기동: ${stub.url}`);
  console.log(`  JWKS: ${stub.url}/auth/v1/.well-known/jwks.json`);
  console.log(`\n  apps/api/.env 에 아래 값이 있어야 합니다:`);
  console.log(`    SUPABASE_URL=${stub.url}`);
  console.log(`\n  supabase_uid(sub): ${sub}`);
  console.log(`  email:             ${email}`);
  console.log(`\n  테스트용 토큰 (2시간 유효):\n`);
  console.log(token);
  console.log(`\n  사용 예:`);
  console.log(`    curl -H "Authorization: Bearer <위 토큰>" http://localhost:3000/auth/me`);
  console.log(`\n  추가 토큰 발급: curl -X POST '${stub.url}/token?sub=<uuid>&email=<email>'\n`);
}
