# Supabase 소셜 로그인 설정 가이드

> 이 문서는 사람 개발자를 위한 한글 가이드입니다. 에이전트용 문서가 아니므로 `AGENTS.md` 색인에 포함하지 않습니다. 기능의 코드 소유 계층과 동작 정의는 [`docs/features/authentication.md`](../features/authentication.md)(영문, 에이전트용)를 참고하세요.

이 앱의 로그인은 **Supabase Auth**로 동작합니다. Google·Apple 소셜 로그인을 실제로 켜려면 개발자가 직접 세팅해야 하는 값과 외부 콘솔 설정이 있습니다. 이 문서는 **무엇을**, **어디서**, **왜** 설정하는지 순서대로 정리합니다.

---

## 왜 이 과정이 필요한가

- **로그인은 백엔드가 아니라 앱이 직접 한다.** 앱이 Supabase에 로그인하면 Supabase가 세션(JWT: access token + refresh token)을 발급합니다. 백엔드 API는 이 JWT를 `Authorization: Bearer <token>`으로 받아 **검증만** 합니다. 즉 로그인 수단을 정하고 연결하는 책임은 프론트(이 앱)에 있습니다.
- **세션은 Supabase가 소유한다.** 토큰 저장·자동 갱신·복원을 Supabase 클라이언트가 담당합니다. 앱은 로그인 상태(현재 사용자)만 화면에 반영합니다. 그래서 앱 코드에서 토큰을 직접 다루지 않고, **연결 정보(프로젝트 주소·키)와 소셜 프로바이더 등록**만 세팅하면 됩니다.
- **소셜 프로바이더는 각 사의 콘솔에서 앱 등록이 선행돼야 한다.** Google·Apple은 "누가 로그인 창을 띄우는지"를 검증하기 위해 OAuth 클라이언트 등록을 요구합니다. 이 등록 없이는 동의 화면 자체가 뜨지 않습니다.

---

## 개발자가 수정해야 하는 값 (요약)

| 값 | 위치 | 어디서 얻나 | 필수 |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | 프로젝트 루트 `.env` | Supabase → Project Settings → API → Project URL | ✅ |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | 프로젝트 루트 `.env` | Supabase → Project Settings → API → `anon` `public` 키 | ✅ |
| Google OAuth client id/secret | Supabase Dashboard(값 입력), Google Cloud Console(값 발급) | Google Cloud Console → Credentials | Google 쓸 때 |
| Apple Service ID / Key | Supabase Dashboard(값 입력), Apple Developer(값 발급) | Apple Developer → Identifiers/Keys | Apple 쓸 때 |
| Redirect URL `snaplyapp://auth/callback` | Supabase → Auth → URL Configuration | 고정값(앱 scheme 기준) | ✅ |

> **`.env`의 두 값은 클라이언트에 공개돼도 안전합니다.** `anon` 키는 공개용 키이고, 실제 데이터 접근은 서버의 Row Level Security(RLS)로 막습니다. `.env`는 저장소에 커밋되지 않도록 `.gitignore`에 등록돼 있습니다. 커밋해야 하는 것은 값이 비어 있는 `.env.example`뿐입니다.

---

## 1. Supabase 프로젝트 만들고 `.env` 채우기

1. [supabase.com](https://supabase.com)에서 프로젝트를 생성합니다.
2. **Project Settings → API** 로 이동해 다음 두 값을 복사합니다.
   - **Project URL** (예: `https://abcdxyz.supabase.co`)
   - **`anon` `public`** 키
3. 프로젝트 루트의 `.env.example`을 복사해 `.env`를 만들고 값을 채웁니다.

   ```bash
   cp .env.example .env
   ```

   ```bash
   # .env
   EXPO_PUBLIC_SUPABASE_URL=https://abcdxyz.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...   # anon public 키
   ```

   > `EXPO_PUBLIC_` 접두사가 붙은 환경 변수는 빌드 시 앱 번들에 포함됩니다. 값을 바꾸면 **Metro를 재시작**해야 반영됩니다(`npx expo start -c`로 캐시 정리 권장).

이 두 값이 없으면 앱은 mock 로그인 상태로 부팅되며(개발 편의용) 실제 로그인은 완료되지 않습니다.

## 2. Supabase에서 Redirect URL 허용하기

**Supabase Dashboard → Authentication → URL Configuration → Redirect URLs** 에 아래 값을 추가합니다.

```
snaplyapp://auth/callback
```

이 값은 앱의 딥링크 scheme(`app.json`의 `"scheme": "snaplyapp"`)을 기준으로 만들어집니다. 소셜 동의가 끝나면 브라우저가 이 주소로 앱에 돌아오고, 앱이 인증 코드를 세션으로 교환합니다. 허용 목록에 없으면 로그인이 마지막 단계에서 실패합니다.

## 3. Google 로그인 켜기

Google은 두 곳을 오갑니다. **Google Cloud Console에서 값을 발급**하고 **Supabase에 입력**합니다.

1. **Supabase Dashboard → Authentication → Providers → Google** 을 열면 **Callback URL**이 보입니다. 형태는 다음과 같습니다.

   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

2. [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized redirect URIs**: 위 1번의 Supabase Callback URL을 그대로 붙여넣습니다.
   - 발급된 **Client ID**와 **Client Secret**을 복사합니다.
3. 다시 **Supabase → Providers → Google** 로 돌아와 Client ID/Secret을 입력하고 **Enable** 후 저장합니다.

## 4. Apple 로그인 켜기

iOS 앱스토어 심사 규정상 **소셜 로그인을 제공하면 Apple 로그인은 필수**입니다.

1. [Apple Developer](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles**
   - **Identifiers**에서 앱의 App ID에 **Sign in with Apple**을 활성화합니다.
   - 로그인 전용 **Services ID**를 만들고, 그 Return URL에 3번에서 본 Supabase Callback URL을 등록합니다.
   - **Keys**에서 Sign in with Apple용 키를 생성하고 **Key ID**·**Team ID**·**private key(.p8)** 를 확보합니다.
2. **Supabase → Authentication → Providers → Apple** 에 Services ID, Team ID, Key ID, private key를 입력하고 **Enable** 후 저장합니다.

## 5. 개발 빌드로 실행하기

**실제 소셜 로그인은 Expo Go에서 동작하지 않습니다.** 커스텀 딥링크 scheme과 브라우저 인증 세션(네이티브 모듈)이 필요하므로 **개발 빌드(dev client)** 로 실행해야 합니다.

- **Android (이 Mac에서 로컬 가능):**

  ```bash
  npx expo run:android
  ```

- **iOS:** 이 저장소 기준 macOS/Xcode 제약으로 로컬 네이티브 빌드가 어렵습니다. **EAS Build**로 개발 빌드를 만들어 시뮬레이터/기기에 설치하세요. (Expo Go로는 로그인 검증 불가.)

## 6. 동작 확인

개발 빌드를 실행한 뒤 다음 흐름을 확인합니다.

1. 로그인 화면에서 **Google**(또는 Apple) 버튼을 탭 → 인앱 브라우저 동의 화면이 뜬다.
2. 동의 후 앱으로 복귀하면 탭 화면으로 진입한다.
3. 앱을 완전히 종료했다가 다시 실행해도 **로그인 상태가 유지**된다(세션 복원).
4. **설정 → 로그아웃** 시 로그인 화면으로 돌아온다.

---

## 참고: Supabase 없이 개발하기 (mock)

Supabase 크리덴셜이나 개발 빌드 없이 화면·플로우만 확인하려면, 로그인 액션의 프로바이더를 mock으로 바꿔 Expo Go에서 실행할 수 있습니다.

- [`src/features/sign-in/model/use-sign-in.ts`](../../src/features/sign-in/model/use-sign-in.ts)에서 바인딩을 한 줄만 교체합니다.

  ```ts
  // 실제
  const authProvider: AuthProvider = supabaseAuthProvider;
  // 오프라인/mock (임시)
  const authProvider: AuthProvider = mockAuthProvider;
  ```

mock은 실제 네트워크·토큰 없이 결정적 가짜 사용자를 반환합니다. 커밋 전에는 반드시 `supabaseAuthProvider`로 되돌리세요.

---

## 자주 겪는 문제

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 로그인 버튼을 눌러도 아무 일도 없음 / mock처럼 동작 | `.env` 값 미설정 또는 Metro 미재시작 | `.env`의 두 값 확인 후 `npx expo start -c`로 재시작 |
| 동의 후 앱으로 복귀했는데 로그인 안 됨 | Supabase Redirect URLs에 `snaplyapp://auth/callback` 누락 | URL Configuration에 정확히 추가 |
| Google 동의 화면에서 `redirect_uri_mismatch` | Google Cloud의 Authorized redirect URI가 Supabase Callback URL과 불일치 | 두 값을 완전히 동일하게 맞춤 |
| Expo Go에서 로그인이 끝까지 안 됨 | Expo Go는 커스텀 scheme/네이티브 인증 세션 미지원 | 개발 빌드로 실행 |
| 로그인은 되는데 재실행 시 세션이 풀림 | (드묾) SecureStore 저장 실패 | 기기 저장소/권한 확인. 세션은 크기가 커도 자동 분할 저장됨 |
