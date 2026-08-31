# Snaply

Snaply는 짧게 여러 번 찍어두면 AI가 한 편의 숏폼 브이로그로 만들어 주는 앱입니다. 3초 또는 5초짜리 **스냅**을 모아두고, 스냅 탭에서 골라 확정하면 곧바로 초안 **무비**가 만들어집니다. 무비 화면은 타임라인 스튜디오입니다: 컷 순서·트림·스타일을 정리한 뒤 생성을 실행하고, 완성본을 같은 화면에서 감상·공유합니다. 촬영 원본은 앱의 문서 디렉터리에 저장되고, 생성에 쓰일 수 있도록 백그라운드에서 백엔드에 업로드됩니다.

> **AI 합성은 실제 백엔드 잡으로 동작합니다** (`POST /edit-jobs`, 2026-08-07). 백엔드가 컷을 자르고 스타일을 입히고 음악·자막을 붙여 렌더 파일을 만들며, 완성 무비는 그 파일을 재생하고 공유합니다. 백엔드 없이(mock 모드) 실행하면 합성 없이 컷을 순서대로 이어 재생합니다. 무엇이 실제로 동작하는지는 [`docs/features/`](docs/features)를 보세요.

Expo SDK 57(React Native 0.86, Expo Router)을 사용하며, Feature-Sliced Design v2.1을 기준으로 프로젝트를 구성합니다.

## 시작하기

의존성을 설치하고, Android 기기(또는 에뮬레이터)에 개발 빌드를 올린 뒤 Metro를 붙입니다. **이 앱은 Expo Go에서 Android가 부팅되지 않습니다** — 시작 시 `expo-notifications`를 import하는데 SDK 53부터 Android Expo Go에서 제거된 모듈이라 렌더 이전에 죽습니다. 따라서 Android의 기준 런타임은 dev build입니다.

```bash
npm install
npm run android:device     # 실기기. 에뮬레이터는 npm run android
npx expo start --dev-client
```

iOS 시뮬레이터는 Expo Go(`npx expo start --go`)로 띄울 수 있습니다.

> **Xcode 16.4까지만 사용할 수 있는 구형 macOS 장비에서는 `npx expo run:ios`를 실행할 수 없습니다.** Expo SDK 57은 Swift 6.2 도구 모음이 필요하므로, 이 조건에 해당하는 장비에서는 iOS 시뮬레이터를 Expo Go로 실행하세요. 최신 macOS와 Swift 6.2를 지원하는 Xcode가 설치된 장비에는 이 제한이 적용되지 않습니다.
>
> 에이전트의 검증 경로와 기기 연결 규칙은 [`docs/workflows/local-development-and-testing.md`](docs/workflows/local-development-and-testing.md)가 기준입니다.

웹(`npm run web`)도 실행할 수 있지만 기준 개발 환경은 아닙니다. 웹에서는 영상 촬영 기능을 사용할 수 없습니다.

## 프로젝트 구조

`src/app/`의 파일은 Expo Router와 화면을 연결하는 얇은 어댑터입니다. 실제 애플리케이션 코드는 FSD 계층에 배치합니다.

```text
src/
├── app/        Expo Router 라우트 파일
├── _app/       Provider, 루트 Stack, Splash, 탭 내비게이션
├── pages/      화면 조합과 화면 단위 상태
├── widgets/    여러 화면이 공유하는 블록(무비 선반, 스냅 그리드)
├── features/   재사용 가능한 사용자 행동
├── entities/   도메인 모델
└── shared/     디자인 토큰, 공용 UI, API 클라이언트, 플랫폼 어댑터
```

## 문서 구조

문서는 독자에 따라 다음과 같이 구분합니다.

| 위치 | 대상과 역할 |
| --- | --- |
| [`README.md`](README.md) | 개발자가 처음 확인하는 프로젝트 소개와 실행 안내 |
| [`docs/guides/`](docs/guides) | 개발자를 위한 설치, 실행, 디버깅 등의 실무 가이드 |
| [`AGENTS.md`](AGENTS.md) | 작업 유형에 맞는 에이전트 문서를 찾기 위한 색인과 공통 규칙 |
| [`docs/architecture/`](docs/architecture) | 아키텍처 원칙과 FSD 계층 기준 |
| [`docs/conventions/`](docs/conventions) | 모듈 경계, 코드 설계 및 작성 규칙 |
| [`docs/frameworks/`](docs/frameworks) | Expo Router와 상태·데이터 처리 규칙 |
| [`docs/workflows/`](docs/workflows) | 기능 개발, 검증, 브랜딩 변경 절차 |
| [`docs/features/`](docs/features) | 현재 사용자 기능, 구현 상태, 소유 계층 기록 |
| [`docs/api/`](docs/api) | 백엔드 OpenAPI 스펙 사본(`openapi.json`) — `npm run api:pull`로 갱신, `npm run api:gen`으로 타입 생성 |

### 개발자 가이드

- [`Android 실기기 무선 연동 가이드`](docs/guides/android-wireless-debugging.md): 실제 Android 기기의 Wi-Fi 디버깅 연결과 개발 빌드 실행 방법
- [`Supabase 소셜 로그인 설정 가이드`](docs/guides/supabase-auth-setup.md): Google·Apple 로그인을 켜기 위한 `.env` 값, Supabase·Google·Apple 콘솔 설정, 개발 빌드 실행 절차
- [`FCM 푸시 알림 설정 가이드`](docs/guides/fcm-push-setup.md): 네이티브 FCM 토큰용 Firebase 프로젝트·앱 등록, `google-services.json`/`GoogleService-Info.plist`/APNs 준비 절차
- [`Snaply 스튜디오 — AI 숏폼 브이로그 기획`](docs/guides/ai-vlog-studio/concept.md): **왜 이 제품 방향인지에 대한 결정 기록.** 스냅↔무비 재정의, 4탭 정보 구조, 용어, 감수한 트레이드오프, 백엔드 계약 초안 (인터랙티브 목업 HTML 포함 — 목업은 옛 화면 구성입니다). **구현 기준이 아닙니다** — 지금 무엇이 어떻게 동작하는지는 항상 [`docs/features/`](docs/features)가 정답입니다

에이전트용 문서는 [`AGENTS.md`](AGENTS.md)에서 작업 유형별로 찾을 수 있습니다.

## 주요 명령어

| 명령어 | 용도 |
| --- | --- |
| `npx expo start --dev-client` | 개발 빌드용 Metro 서버 실행(Android 기준 런타임) |
| `npx expo start --go` | Expo Go용 Metro 서버 실행(iOS 시뮬레이터 전용 — Android Expo Go는 부팅 불가) |
| `npm run android` / `npm run android:device` | Android 개발 빌드를 에뮬레이터/실기기에 빌드·실행 |
| `npm run android:device:release` | 릴리스 APK를 빌드해 실기기에 설치 |
| `npm run web` | 웹 환경 실행(기준 개발 환경 아님) |
| `npm run api:pull` | 백엔드에서 OpenAPI 스펙(`docs/api/openapi.json`) 갱신 |
| `npm run api:gen` | 스펙에서 API 타입(`src/shared/api/schema.d.ts`) 생성 |
| `npm run verify` | **자동 검증 게이트.** 검증 목록은 `package.json`의 `verify` 스크립트가 유일한 기준이며, CI도 같은 명령을 실행합니다 |
| `npm run lint` | ESLint 검사 실행 |
| `npm run format` | Prettier로 전체 코드 자동 포맷 |
| `npm run format:check` | 포맷 위반 여부만 검사 |
| `npm run typecheck` | TypeScript 타입 검사 실행 |
| `npm run api:check` | 스펙과 생성된 API 타입의 동기화 검사 |
| `npm test` | Jest 워치 모드로 테스트 실행 |
| `npm run test:ci` | 단일 실행 테스트(`--runInBand`) |

## 런타임 의존성

`dependencies`는 앱 번들에 포함되어 실제 기능을 구성하는 패키지입니다. 버전은 Expo SDK 57에 맞춰 고정합니다. 일부 Expo 모듈은 코드에서 직접 `import`하지 않고 [`app.json`](app.json)의 `plugins`로 네이티브 설정만 주입하며, 표에 `(app.json 플러그인)`으로 표시했습니다. 코드에서도 `app.json`에서도 쓰이지 않는 패키지는 두지 않습니다 — 예정 기능을 위해 미리 설치해 두면 네이티브 빌드 표면만 넓히고, 무엇이 실제로 쓰이는지 이 표에서 읽을 수 없게 됩니다.

### 코어 프레임워크

| 패키지 | 사용 이유 |
| --- | --- |
| `expo` | Expo SDK 런타임과 모듈 시스템. 프로젝트의 기반입니다. |
| `react`, `react-dom` | React 19 런타임. RN과 웹 렌더링의 공통 코어입니다. |
| `react-native` | React Native 0.86 런타임. iOS·Android 네이티브 렌더링을 담당합니다. |
| `react-native-web` | 웹 타깃 렌더링. `npm run web`용이며 기준 개발 환경은 아닙니다. |

### 라우팅과 화면 인프라

| 패키지 | 사용 이유 |
| --- | --- |
| `expo-router` | 파일 기반 라우팅. `src/app/`의 파일을 화면에 연결합니다. |
| `react-native-screens` | 네이티브 화면 스택 최적화. Expo Router의 내비게이션 기반입니다. |
| `react-native-safe-area-context` | 노치·상태바 등 안전 영역 인셋 계산. 레이아웃 전반에서 사용합니다. |
| `react-native-gesture-handler` | 네이티브 제스처 처리. 내비게이션·애니메이션 인프라로 사용합니다. |

### 상태와 데이터

| 패키지 | 사용 이유 |
| --- | --- |
| `@tanstack/react-query` | 서버 상태(데이터 페칭·캐싱·동기화) 관리. |
| `zustand` | 클라이언트 전역 상태 관리. |
| `@supabase/supabase-js` | Supabase 백엔드·인증 클라이언트. |
| `react-native-url-polyfill` | RN 환경에 `URL` 표준 구현을 주입합니다. `supabase-js`가 요구합니다. |

> 상태·데이터 코드의 배치 규칙은 [`docs/frameworks/state-and-data.md`](docs/frameworks/state-and-data.md)를 따릅니다.

### 폼과 검증

| 패키지 | 사용 이유 |
| --- | --- |
| `react-hook-form` | 폼 상태·검증 관리. |
| `@hookform/resolvers` | React Hook Form과 Zod 스키마를 연결하는 리졸버. |
| `zod` | 런타임 스키마 검증과 타입 추론. API 응답·폼 검증에 사용합니다. |

### 인증

| 패키지 | 사용 이유 |
| --- | --- |
| `expo-auth-session` | OAuth 인증 세션 흐름 처리. |
| `expo-web-browser` | 인증 시 시스템 브라우저 세션 실행. |
| `expo-secure-store` | 세션 토큰 등 민감 정보의 암호화 저장. |

> 소셜 로그인 설정 절차는 [`docs/guides/supabase-auth-setup.md`](docs/guides/supabase-auth-setup.md)를 참고합니다.

### 카메라와 미디어

| 패키지 | 사용 이유 |
| --- | --- |
| `expo-camera` | 영상 촬영. 앱의 핵심 기능입니다. (app.json 플러그인) |
| `expo-video` | 촬영 원본·결과 영상 재생. |
| `expo-image` | 이미지 렌더링과 캐싱. (app.json 플러그인) |
| `expo-file-system` | 촬영 영상을 로컬 문서 디렉터리에 저장·관리. |
| `expo-sharing` | 완성 무비 내보내기용 시스템 공유 시트 호출. 렌더 파일을 캐시에 내려받아 공유합니다. (app.json 플러그인) |
| `expo-video-thumbnails` | 영상 첫 프레임 썸네일 생성. 스냅 그리드와 타임라인 클립에 사용합니다. |

### 위치와 알림

| 패키지 | 사용 이유 |
| --- | --- |
| `expo-location` | 위치 조회와 지오펜스. 위치 기반 알림의 기반입니다. (app.json 플러그인) |
| `expo-task-manager` | 백그라운드 지오펜스 태스크 등록·실행. |
| `expo-notifications` | 로컬 알림 표시와 권한 처리. |
| `@react-native-firebase/app` | Firebase 네이티브 SDK 초기화. FCM의 기반입니다. (app.json 플러그인) |
| `@react-native-firebase/messaging` | FCM 토큰 발급과 푸시 메시지 수신. (app.json 플러그인) |

> Firebase 콘솔 준비 절차는 [`docs/guides/fcm-push-setup.md`](docs/guides/fcm-push-setup.md), 현재 동작하는 범위와 소유 계층은 [`docs/features/location-and-push-notifications.md`](docs/features/location-and-push-notifications.md)를 참고합니다.

### UI·애니메이션·피드백

| 패키지 | 사용 이유 |
| --- | --- |
| `react-native-reanimated` | 고성능 네이티브 애니메이션. |
| `react-native-worklets` | Reanimated 4가 요구하는 워클릿 런타임. |
| `react-native-svg` | 벡터 그래픽. 촬영 홀드 링과 타임라인 트림 핸들을 그립니다. |
| `expo-haptics` | 촉각 피드백(진동). |
| `expo-blur` | 탭바 등 블러 배경 효과. |
| `@expo/vector-icons` | 아이콘 세트. |
| `expo-font` | 본문 폰트 Pretendard GOV를 네이티브에 내장. (app.json 플러그인) |

### 앱 셸과 시스템

| 패키지 | 사용 이유 |
| --- | --- |
| `expo-splash-screen` | 스플래시 화면 표시와 해제 제어. (app.json 플러그인) |
| `expo-status-bar` | 상태바 스타일 제어. (app.json 플러그인) |
| `expo-navigation-bar` | Android 시스템 내비게이션 바 제어(탭바 블러 연동). (app.json 플러그인) |
| `expo-system-ui` | 루트 배경색 등 시스템 UI 설정(설정 기반). |
| `expo-linking` | 딥링크·OAuth 리다이렉트 URL 처리. |
| `expo-constants` | 앱 설정·상수 접근. 앱 코드는 직접 쓰지 않고(환경 변수는 `process.env`로 읽음) `expo-auth-session`·`expo-linking`·`expo-notifications`가 요구합니다. |

### 빌드와 개발 도구

| 패키지 | 사용 이유 |
| --- | --- |
| `expo-dev-client` | 커스텀 개발 빌드 실행기. 네이티브 모듈 포함 빌드를 Expo Go 대신 실행합니다. |
| `expo-build-properties` | 네이티브 빌드 속성(SDK 버전 등) 설정. (app.json 플러그인) |

## 개발 의존성

`devDependencies`는 앱 런타임 번들에 포함되지 않고, 코드 품질 검증(테스트·린트·포맷·타입 검사)에만 사용하는 도구입니다. 도구 버전은 Expo SDK 57 프리셋에 맞춰 고정합니다.

### 테스트

| 패키지 | 사용 이유 |
| --- | --- |
| `jest` | 테스트 러너. 함수·스토어·훅·컴포넌트 단위 테스트를 실행합니다. |
| `jest-expo` | Jest 프리셋. Expo/React Native 0.86 환경(트랜스폼, 네이티브 모듈 목, `winter` 런타임 등)에 맞게 Jest를 구성합니다. [`jest.config.js`](jest.config.js)의 `preset`으로 지정합니다. |
| `@testing-library/react-native` | 사용자 관점의 컴포넌트·훅 테스트 도구. 내부 구현 대신 렌더링 결과와 상호작용을 검증합니다. |
| `@types/jest` | Jest 전역 API(`describe`, `it`, `expect` 등)의 타입 정의. [`tsconfig.json`](tsconfig.json)의 `types`에 등록해 테스트 코드에서 타입 지원을 받습니다. |

> Jest 설정과 목 작성 규칙은 [`docs/workflows/writing-unit-tests.md`](docs/workflows/writing-unit-tests.md)를 따릅니다. [`jest.setup.js`](jest.setup.js)는 `--runInBand` 실행 시 발생하던 `winter` 런타임 경고로 인한 실패를 막기 위한 설정입니다.

### 린트와 포맷

| 패키지 | 사용 이유 |
| --- | --- |
| `eslint` | 정적 분석기(v9 플랫 config). 잠재적 오류와 안티패턴을 잡습니다. |
| `eslint-config-expo` | Expo 공식 ESLint 프리셋. Expo/React Native 프로젝트에 맞는 규칙 집합을 제공합니다. [`eslint.config.js`](eslint.config.js)의 기본 설정입니다. |
| `eslint-config-prettier` | Prettier와 충돌하는 ESLint 서식 규칙을 끕니다. 포맷은 Prettier가, 코드 품질은 ESLint가 담당하도록 역할을 분리하며, config 배열의 **마지막**에 배치해야 합니다. |
| `prettier` | 코드 포맷터. 서식을 자동으로 통일합니다. 규칙은 [`.prettierrc.json`](.prettierrc.json)(세미콜론, 작은따옴표, `printWidth` 100 등)에 정의합니다. |

### 타입

| 패키지 | 사용 이유 |
| --- | --- |
| `typescript` | 타입 검사기. `strict` 모드로 컴파일 없이 타입만 검사(`tsc --noEmit`)합니다. |
| `@types/react` | React 19의 타입 정의. JSX와 훅의 타입 지원을 제공합니다. |

### API 코드 생성

| 패키지 | 사용 이유 |
| --- | --- |
| `openapi-typescript` | 커밋된 OpenAPI 스펙(`docs/api/openapi.json`)에서 API 타입(`src/shared/api/schema.d.ts`)을 생성합니다(`npm run api:gen`). 절차는 [`docs/workflows/openapi-api-integration.md`](docs/workflows/openapi-api-integration.md)를 따릅니다. |
