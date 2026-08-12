import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * 플랫폼 콘솔(틱톡 Login Kit, Meta 앱 검수)이 요구하는 공개 페이지.
 *
 * 인스타·틱톡 모두 앱 설정을 **저장**하는 단계에서 서비스 URL·이용약관·개인정보처리방침
 * URL 을 필수로 받는다. 그래서 로컬 터널로도 접근 가능한 최소 페이지를 API 가 직접 서빙한다.
 *
 * ⚠️ 아래 문서는 **출시 전 초안**이다. 실제 수집 항목을 코드 기준으로 정확히 기술했지만
 * 법률 검토를 받지 않았다. 앱 심사 제출·서비스 출시 전에 반드시 법무 검토를 거쳐 교체할 것.
 */

const SERVICE = 'Snaply';
const CONTACT = process.env.LEGAL_CONTACT_EMAIL ?? 'support@snaply.app';
const UPDATED = '2026-08-10';

/**
 * 플랫폼의 URL 소유권 검증용 메타 태그.
 *
 * 틱톡·Meta 등은 약관/개인정보 URL 이나 영상 URL prefix 의 소유권 검증을 요구한다.
 * DNS TXT 방식은 우리가 도메인을 소유하지 않는 개발 터널에서는 불가능하므로,
 * 서빙하는 페이지에 메타 태그를 넣거나(아래) 검증 파일을 서빙하는(verificationFile) 방식을 쓴다.
 *
 * 형식: `name=content` 를 콤마로 구분.
 * 예: SITE_VERIFICATION_META="tiktok-developers-site-verification=abc123"
 */
function verificationMetaTags(): string {
  const raw = process.env.SITE_VERIFICATION_META;
  if (!raw) {
    return '';
  }
  return raw
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf('=');
      if (idx <= 0) return '';
      const name = pair.slice(0, idx).trim();
      const content = pair.slice(idx + 1).trim();
      return `<meta name="${escapeAttr(name)}" content="${escapeAttr(content)}">`;
    })
    .filter(Boolean)
    .join('\n');
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${verificationMetaTags()}
<title>${title} · ${SERVICE}</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 720px; margin: 0 auto; padding: 2rem 1.25rem 4rem;
         font: 16px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif; }
  h1 { font-size: 1.6rem; margin-bottom: .25rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; }
  .meta { color: #888; font-size: .85rem; margin-bottom: 2rem; }
  .draft { border-left: 3px solid #d97706; background: rgba(217,119,6,.08);
           padding: .75rem 1rem; margin: 1.5rem 0; font-size: .9rem; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: .92rem; }
  th, td { border: 1px solid rgba(128,128,128,.35); padding: .5rem .6rem; text-align: left; vertical-align: top; }
  code { font-size: .9em; }
  a { color: inherit; }
</style>
</head>
<body>
<h1>${title}</h1>
<p class="meta">${SERVICE} · 최종 수정 ${UPDATED}</p>
<div class="draft"><strong>출시 전 초안입니다.</strong> 개발·심사 준비 단계에서 사용하는 문서이며,
법률 검토를 거쳐 정식 문서로 교체될 예정입니다.</div>
${body}
<h2>문의</h2>
<p>${CONTACT}</p>
</body>
</html>`;
}

export async function legalRoutes(app: FastifyInstance): Promise<void> {
  /**
   * 검증 파일 서빙.
   *   SITE_VERIFICATION_FILE_NAME=tiktokAbc123.txt
   *   SITE_VERIFICATION_FILE_CONTENT=<파일에 들어갈 문자열>
   *
   * 플랫폼의 검증 방식이 두 가지라 경로도 두 곳에서 받는다:
   *  - **domain** 검증 → 파일이 도메인 루트에 있어야 한다        → `/<파일명>`
   *  - **URL prefix** 검증 → 파일이 그 prefix 아래 있어야 한다    → `/legal/<파일명>`
   *    (약관·개인정보 URL 을 검증할 때 prefix 는 보통 `.../legal/` 이 된다)
   *
   * 설정된 파일명이 아니면 404 로 흘려보낸다. Fastify 는 정적 경로를 파라미터 경로보다
   * 우선하므로 /health, /legal/terms 같은 기존 경로에는 영향이 없다(테스트로 고정).
   */
  const serveVerificationFile = async (
    request: FastifyRequest<{ Params: { filename: string } }>,
    reply: FastifyReply,
  ): Promise<unknown> => {
    const expected = process.env.SITE_VERIFICATION_FILE_NAME;
    const content = process.env.SITE_VERIFICATION_FILE_CONTENT;
    if (!expected || !content || request.params.filename !== expected) {
      return reply.callNotFound();
    }
    return reply.type('text/plain; charset=utf-8').send(content);
  };

  for (const path of ['/:filename', '/legal/:filename']) {
    app.get<{ Params: { filename: string } }>(
      path,
      { schema: { tags: ['system'], summary: '플랫폼 URL 소유권 검증 파일' } },
      serveVerificationFile,
    );
  }

  // 서비스 소개 (콘솔의 Web/Desktop URL 용)
  app.get('/', { schema: { tags: ['system'], summary: '서비스 소개' } }, async (_req, reply) => {
    return reply.type('text/html; charset=utf-8').send(
      page(
        `${SERVICE} — 숏폼 브이로그 AI 자동 편집`,
        `<p>${SERVICE}는 사용자가 촬영한 짧은 영상 클립을 자동으로 편집해
         숏폼 브이로그를 만들어 주는 모바일 서비스입니다. 컷 편집·배경음악·자막을 자동으로 넣고,
         완성된 영상을 사용자가 원하면 인스타그램 릴스나 틱톡에 올릴 수 있습니다.</p>
         <h2>주요 기능</h2>
         <ul>
           <li>여러 영상 클립을 하나의 숏폼 영상으로 자동 편집</li>
           <li>스타일 프리셋(감성·여행·일상)에 따른 색보정·전환·배경음악</li>
           <li>음성 인식 기반 자동 자막</li>
           <li>사용자가 연동한 SNS 계정으로 완성본 업로드</li>
           <li>관심 장소 근처에서 촬영을 제안하는 위치 알림</li>
         </ul>
         <h2>문서</h2>
         <ul>
           <li><a href="/legal/terms">이용약관</a></li>
           <li><a href="/legal/privacy">개인정보처리방침</a></li>
         </ul>`,
      ),
    );
  });

  app.get('/legal/terms', { schema: { tags: ['system'], summary: '이용약관' } }, async (_req, reply) => {
    return reply.type('text/html; charset=utf-8').send(
      page(
        '이용약관',
        `<h2>1. 서비스 내용</h2>
         <p>${SERVICE}는 사용자가 업로드한 영상 클립을 자동 편집하고, 사용자의 요청이 있을 때
         사용자가 연동한 외부 플랫폼(인스타그램·틱톡)에 결과물을 업로드하는 기능을 제공합니다.</p>

         <h2>2. 계정</h2>
         <p>서비스 이용에는 계정이 필요합니다. 계정 정보의 관리 책임은 사용자에게 있습니다.</p>

         <h2>3. 콘텐츠에 대한 권리와 책임</h2>
         <ul>
           <li>사용자가 업로드한 영상의 저작권은 사용자에게 있습니다. ${SERVICE}는 편집·저장·
               사용자가 지시한 업로드를 수행하기 위한 범위에서만 콘텐츠를 처리합니다.</li>
           <li>타인의 권리를 침해하거나 법령·외부 플랫폼 정책에 위반되는 콘텐츠를 업로드해서는 안 됩니다.</li>
           <li>외부 플랫폼에 업로드할 때에는 해당 플랫폼의 약관이 함께 적용됩니다.</li>
         </ul>

         <h2>4. SNS 연동</h2>
         <p>사용자가 명시적으로 연동을 승인한 계정에 대해서만, 사용자가 업로드를 요청한 영상에 한해
         게시합니다. 연동은 언제든지 해제할 수 있으며, 해제 시 저장된 접근 토큰은 삭제됩니다.</p>

         <h2>5. 유료 구독</h2>
         <p>일부 기능은 유료 구독으로 제공됩니다. 결제는 결제대행사(Stripe)를 통해 처리되며
         ${SERVICE}는 카드 정보를 저장하지 않습니다. 해지는 언제든 가능하고, 해지 시 이미 결제된
         이용 기간의 종료 시점까지 서비스가 유지됩니다.</p>

         <h2>6. 서비스 변경 및 중단</h2>
         <p>서비스 내용은 변경될 수 있으며, 중요한 변경은 사전에 공지합니다.</p>

         <h2>7. 책임의 한계</h2>
         <p>자동 편집 결과물의 품질, 외부 플랫폼의 정책 변경이나 장애로 인한 업로드 실패 등
         ${SERVICE}의 통제 범위를 벗어난 사유에 대해서는 책임이 제한될 수 있습니다.</p>`,
      ),
    );
  });

  app.get('/legal/privacy', { schema: { tags: ['system'], summary: '개인정보처리방침' } }, async (_req, reply) => {
    return reply.type('text/html; charset=utf-8').send(
      page(
        '개인정보처리방침',
        `<h2>1. 수집하는 정보</h2>
         <table>
           <tr><th>항목</th><th>목적</th></tr>
           <tr><td>계정 식별자, 이메일</td><td>로그인·본인 확인</td></tr>
           <tr><td>닉네임, 프로필 이미지, 관심사</td><td>프로필 표시, 콘텐츠 추천</td></tr>
           <tr><td>업로드한 영상 클립과 편집 결과물</td><td>자동 편집 및 결과물 제공</td></tr>
           <tr><td>푸시 알림 토큰</td><td>알림 발송</td></tr>
           <tr><td>알림 발송 이력(장소·시각)</td><td>중복 알림 방지</td></tr>
           <tr><td>SNS 접근 토큰</td><td>사용자가 요청한 게시 수행 (암호화 저장)</td></tr>
           <tr><td>구독 상태, 결제대행사 고객 식별자</td><td>유료 기능 제공</td></tr>
         </table>
         <p>위치 정보는 주변 장소를 조회할 때 사용되며 서버에 저장하지 않습니다.
         알림이 실제로 발송된 경우에 한해 어느 장소에서 언제 보냈는지만 기록합니다.
         결제 카드 정보는 수집·저장하지 않습니다.</p>

         <h2>2. 보관 및 파기</h2>
         <p>계정을 삭제하면 프로필, 영상, 연동 정보, 알림 이력이 함께 삭제됩니다.
         계정 삭제를 요청하면 SNS 접근 토큰과 푸시 알림 토큰은 즉시 삭제되며, 나머지 정보는
         30일의 복구 유예 기간이 지난 뒤 영구 삭제됩니다. 유예 기간 중에는 앱에서 삭제를
         철회할 수 있습니다. SNS 연동을 해제하면 해당 접근 토큰은 즉시 삭제됩니다.</p>

         <h2>3. 제3자 제공 및 처리 위탁</h2>
         <table>
           <tr><th>수탁자</th><th>위탁 내용</th></tr>
           <tr><td>Supabase</td><td>계정 인증, 데이터베이스</td></tr>
           <tr><td>Amazon Web Services</td><td>영상 파일 저장 및 전송</td></tr>
           <tr><td>Google (Firebase)</td><td>푸시 알림 발송</td></tr>
           <tr><td>Meta (Instagram)</td><td>사용자가 요청한 릴스 게시</td></tr>
           <tr><td>TikTok</td><td>사용자가 요청한 영상 게시</td></tr>
           <tr><td>Stripe</td><td>구독 결제 처리</td></tr>
           <tr><td>Sentry</td><td>오류 수집 (개인정보는 마스킹)</td></tr>
         </table>
         <p>외부 플랫폼 게시는 <strong>사용자가 명시적으로 요청한 경우에만</strong> 이루어집니다.</p>

         <h2>4. 안전조치</h2>
         <ul>
           <li>SNS 접근 토큰은 AES-256-GCM 으로 암호화하여 저장합니다.</li>
           <li>영상은 소유자별로 분리된 경로에 저장되며, 타인의 영상에는 접근할 수 없습니다.</li>
           <li>로그에서 인증 헤더와 각종 토큰은 마스킹 처리합니다.</li>
         </ul>

         <h2>5. 이용자의 권리</h2>
         <p>본인 정보의 열람·수정·삭제, SNS 연동 해제, 알림 수신 거부를 앱에서 직접 하실 수 있으며,
         아래 연락처로 요청하실 수도 있습니다.</p>`,
      ),
    );
  });
}
