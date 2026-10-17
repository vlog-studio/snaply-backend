# 정크 저널 리디자인 — 현행 토큰·컴포넌트 대응표

**작성일**: 2026-10-17
**상태**: 제안 — 앱 화면을 정크 저널 시안으로 바꿀 때 현재 디자인 토큰과 공용 컴포넌트가 각각 무엇이 되는지의 대응표
**원천**: 시안은 Claude 디자인 아티팩트 [Snaply 정크 저널 시안](https://claude.ai/artifact/RsiA1bkskX2LTd6WVAVUdQ)(보드 39개 · `project/ds/snaplyjj/tokens.json` · 컴포넌트 CSS `bundle.css`)이고, 앱의 모든 화면에 입힌 결과는 캔버스 [Snaply 정크 저널 전체 화면](https://claude.ai/artifact/7SURcRJRzVowNeB7WVeFye)(보드 103개 — 이 대응표의 새 토큰까지 `jj-tokens.css` · `jj-overrides.css`에 들어 있다)이다. 현행 토큰의 원천은 `apps/mobile/src/shared/ui/theme/theme.ts`, 글자 역할은 `apps/mobile/src/shared/ui/themed-text/themed-text.tsx`
**관련 문서**: [decisions/junk-journal-design-system.md](../decisions/junk-journal-design-system.md) · [cookbook §14](../../apps/mobile/docs/conventions/cookbook.md#14-consuming-the-design-system) · [앱 글꼴](../../apps/mobile/docs/workflows/app-branding-and-native-config.md#app-font) · [기능 문서](../../apps/mobile/docs/features/README.md) · [specs/](../specs/README.md)

시안은 개발자가 낸 아이디어를 Claude 가 구체화한 것이다. 정크 저널로 바꾸기로 한 결정과, 이 대응표에서 하나로
정해지지 않던 여섯 가지 선택은 [decisions/junk-journal-design-system.md](../decisions/junk-journal-design-system.md)가
원천이다(2026-10-17 결정). 화면별 모습은 [캔버스](https://claude.ai/artifact/7SURcRJRzVowNeB7WVeFye)를 본다 — 이 문서는
토큰과 공용 컴포넌트까지만 다룬다. 시안이 박아 둔 정책 값(크레딧 · 보관 기간 · 알림 기본값 등)이 스펙과 다르면
**스펙을 따른다** — 시안도 캔버스도 동작의 원천이 아니다.

## 요약

- **색**: 현재 역할 15개 중 13개는 시안 토큰 하나로, `primary` · `border` · `danger` 는 **쓰임에 따라 둘 이상으로
  갈라진다**(채움과 글자, 장식 선과 기능 경계). 시안에만 있는 종이 무늬 · 스티커 · 테이프 색은 새 토큰이다.
- **의미가 바뀌는 곳 셋**: ① 주색이 ember 주황(`#EA5E38`, 짙은 글자)에서 cherry 빨강(`#d7263d`, **흰 글자**)으로.
  ② 빨강이 주 행동이 되므로 **삭제 버튼은 빨강이 아니라** 크래프트 바탕 + `VOID` 도장으로 구분한다.
  ③ 둥근 모서리가 사라진다 — `Radius` 109곳이 0 이 되고, 모서리 모양은 잘림 · 찢김 · 천공 컴포넌트가 맡는다.
- **글자**: Pretendard GOV 는 그대로 두되 **400 · 700 두 굵기만** 쓴다. 손글씨 제목(Gaegu)과 데이터용 고정폭
  (D2Coding)이 새로 들어온다. 12px 미만 단계(`micro` 11px)는 없어진다.
- **간격**: `Spacing` 9단계가 시안의 `space-2`~`space-64` 와 값이 같아 **바뀌지 않는다**.
- **새로 생기는 축**: 오프셋 그림자, 고정 기울기, 종이 무늬 바탕.

## 1. 색

현행 열의 쓰임은 `apps/mobile/src` 에서 세었다(2026-10-17, 글자 = `color` · `themeColor`, 바탕 = `backgroundColor`,
테두리 = `border*Color`). 대비는 WCAG 비율이다.

| 현행 역할 | 쓰임 | 시안 토큰 · 낮 / 밤 | 비고 |
|---|---|---|---|
| `text` | 모든 `ThemedText` 기본 | `ink` `#2b2b2b` / `#f3e7cf` | 바탕 위 12.94 / 10.38 |
| `background` | 바탕 40 | `paper` `#fbf4e6` / `#3d3028` | 괘선 · 격자는 색이 아니라 [§5](#5-컴포넌트)의 종이 바탕 컴포넌트가 그린다. 격자 바탕 화면(스냅 고르기)은 `paper-grid` |
| `backgroundElement` | 바탕 20 | `sheet` `#fffdf7` / `#4a3b31` | 밤에는 `sheet` 와 `paper` 의 차이가 1.19 라 카드 경계를 그림자가 맡는다 |
| `backgroundSelected` | 바탕 6 | **대응 없음** | 시안의 선택은 색이 아니라 테이프 · cherry 테두리 · 순번 스티커(스냅 고르기), 눌림은 `pink`(`jj-row:active`)다. 6곳을 하나씩 바꾼다 |
| `textSecondary` | 글자 100 | `ink-muted` `#6b6357` / `#b8ac98` | `paper` 위 5.41 / 5.69, 밤 `sheet` 위 4.79 — 더 연하게 바꾸지 않는다 |
| `tabInactive` | 1 | 탭 스텁의 `ink` | 탭 바 바탕은 새 토큰 `tabbar` — 낮 `#d8b48c`(= `kraft`) / 밤 `#6b5238`([결정 3](../decisions/junk-journal-design-system.md#여섯-가지-선택)). 시안은 `kraft` 를 밤에도 그대로 써 밝은 띠가 남았다. 밤 바탕이 어두우므로 지금 밤 테마의 Android 내비게이션 바 처리를 그대로 쓴다 |
| `border` | 테두리 78 · 바탕 11 | 장식 선 → `paper-edge` `#d9cbb5` / `#5a4a3e` · 목록 줄 → `rule-line` · 기능 경계 → `field-line`(= `ink-muted`) | `paper-edge` 는 바탕 대비 1.46 / 1.50 이라 **장식 전용**이다. 입력란 밑줄 · 체크 · 라디오처럼 경계가 곧 기능인 곳은 `ink-muted`(5.41 / 5.69)를 쓴다 |
| `primary` | 글자 26 · 바탕 15 · 테두리 10 | 채움 → `cherry` `#d7263d`(밤 동일) · 글자 · 아이콘 → `cherry-ink` `#b81e33` / `#ff8a96` | `cherry` 를 글자에 쓰면 낮 4.53(경계), **밤 2.56(불합격)** 이다. 글자에는 반드시 `cherry-ink` |
| `onPrimary` | 글자 16 | `on-cherry` `#ffffff` | 짙은 글자(5.51)에서 흰 글자(4.96)로. 16px 굵게 이상에서만 쓴다 |
| `ai` · `lumen` | 8개 파일(버튼 `ai` 변형 · 진행 링 · 타임라인 · 무비 배지) · `lumen` 글자 4 | 채움 → `lavender` `#d9ccf2` + 글자 `sticker-ink` · 글자 · 선 → 새 토큰 `lavender-ink` `#5b4a91` / `#c8b6f2` | 시안에는 AI 용 글자 · 선 색이 없고 `lavender` 는 글자로 1.51 이라 못 쓴다. `lavender-ink` 는 [결정 1](../decisions/junk-journal-design-system.md#여섯-가지-선택)로 더했다(paper 대비 6.77 / 6.92) |
| `media` | 15 | `media` `#0e0b08` | 값까지 같다. 영상 무대는 기울이지 않는다(`tilt-media` 0°) |
| `warmSurface` | 바탕 8(알림 띠) | `butter` `#fff1a8` + 글자 `sticker-ink` | 고정 안내의 버터 띠. 같은 색의 포스트잇은 사라지는 알림(토스트) 전용이다. 스티커 색은 밤에도 그대로라 글자도 늘 `sticker-ink`(12.41) |
| `danger` | 글자 34 · 바탕 7 · 테두리 10 | 오류 글자 → `cherry-ink` · 실패 배지 → `cherry` + `on-cherry`(`jj-tag--failed`) · 삭제 버튼 → `kraft` + `sticker-ink` + `VOID` 도장(`jj-ticket--danger`) | 주 행동과 오류가 같은 빨강 계열이 되므로 구분은 **모양**(입장권 · 크래프트 · 도장)과 문구가 맡는다 |
| `amber` | 바탕 5 · 글자 1 · 테두리 1 | 경고 바탕 → `butter`, 그 밖 → `kraft` | 10곳을 하나씩 판단 |

시안에만 있는 색(현행 대응 없음):

| 묶음 | 토큰 | 쓰임 |
|---|---|---|
| 종이 무늬 | `paper-grid` · `grid-line` · `rule-line` · `margin-line` | 종이 바탕 컴포넌트 전용 |
| 스티커 채움 | `pink` · `mint` · `butter` · `lavender` · `sky` · `receipt-green` · `kraft` | 밤에도 값이 같다. 위 글자는 늘 `sticker-ink` `#2b2b2b`(7.30–12.41) |
| 마스킹 테이프 | `tape-pink` · `tape-mint` · `tape-butter` · `tape-sky` · `tape-lavender` | 스티커 색의 85% 불투명 |
| 데이터 글자 | `navy` `#1f3a68` / `#9cc3f0` · `receipt-blue` `#255a9b` / `#9cc3f0` | 보조 버튼 글자 · 영수증 값 · 데이터 줄 |
| 기타 | `ribbon`(타임라인 바탕) · `shadow-ink` · `focus`(= `ink`) | |
| 시안 밖에서 더한 토큰 | `lavender-ink` · `tabbar` | [결정 1 · 3](../decisions/junk-journal-design-system.md#여섯-가지-선택) |

## 2. 글자

### 글꼴

| 현행 | 시안 | 비고 |
|---|---|---|
| `Fonts.sans` Pretendard GOV — 400 · 500 · 700 · 800 내장 | Pretendard GOV 400 · 700 | 굵기 하나가 약 5MB 다(`theme.ts` 의 `Fonts` 주석). **500 · 800 을 빼면 약 10MB** 가 줄어 아래 두 글꼴을 넣을 여유가 생긴다 |
| `Fonts.mono` 시스템 고정폭(한글 없음) | D2Coding(대체 Nanum Gothic Coding) 400 · 700 | 시안의 데이터 줄은 한글을 담는다(`스냅 18개 · 1:08` · `6컷 중 4컷 있어요`). 시스템 고정폭이면 한글이 OS 글꼴로 떨어지므로 내장한다([결정 2](../decisions/junk-journal-design-system.md#여섯-가지-선택)) |
| 없음 | Gaegu 700 | 손글씨 제목. 22px 미만에는 쓰지 않는다 |
| 없음 | 랜섬 제목(Black Han Sans · Do Hyeon · Song Myung · Nanum Brush Script) | **글꼴로 넣지 않는다.** 탭 제목 4개(`스튜디오` · `스냅` · `무비` · `나`)와 `완성!` 을 글자 윤곽 SVG 로 넣고 제목 역할과 이름을 붙인다(시안 보드 "탭 제목 · 한 글자씩 오려 붙인 조각"의 제안) |

글꼴을 더하거나 빼는 것은 네이티브에 구워지는 설정이라 [앱 글꼴](../../apps/mobile/docs/workflows/app-branding-and-native-config.md#app-font)의
절차(prebuild · 재빌드)를 따른다. 라이선스는 모두 SIL OFL 로 알려져 있지만 넣기 전에 파일별로 확인한다.

### 크기 단계 (`Typography`)

| 현행 | 시안 | 바뀌는 것 |
|---|---|---|
| `micro` 11/16 | 없음 | 시안은 12px 미만을 금지한다. `note`(60곳) · `edge`(3곳)가 12px 로 커지므로 좁은 줄의 줄바꿈을 확인한다 |
| `xsmall` 12/16 | `xsmall` · `data-sm` 12/16 | |
| `small` 14/20 | `small` · `small-bold` 14/20 | 시안이 쓰던 sans 13/18 도 여기로 접는다([결정 7](../decisions/junk-journal-design-system.md#캔버스-검토-뒤-더한-선택)) |
| 없음 | `data` 13/20 | 새 단계 — 영수증 줄 · 타임라인 눈금 · 메타 |
| 없음 | `body-sm` 15/22 | 새 단계 — 시트 · 안내 띠 · 확인 문구의 본문([결정 7](../decisions/junk-journal-design-system.md#캔버스-검토-뒤-더한-선택)) |
| `body` 16/24 | `body` · `button` · `data-lg` 16/24 | |
| 없음 | `bar-title` 17/24 굵게 | 새 단계 — 밀어 넣는 화면의 머리 제목([결정 7](../decisions/junk-journal-design-system.md#캔버스-검토-뒤-더한-선택)) |
| `heading` 21/28 | `hand-heading` 22/28 | 1px 커진다 |
| `subtitle` 26/32 | `hand-subtitle` 26/32 | |
| `title` 32/40 | `hand-title` 32/40 | |
| `display` 42/48 | 없음 | 쓰는 곳 0 — 지운다 |

### `ThemedText` 역할

| `type` | 쓰는 곳 | 현행 | 시안 스타일 | 바뀌는 것 |
|---|---|---|---|---|
| `default` | 기본 | body 500 | `body` 400 | 굵기 |
| `small` | 89 | 14 · 500 | `small` 400 | 굵기 |
| `smallBold` | 65 | 14 · 700 | `small-bold` | 없음 |
| `xsmall` | 5 | 12 · 500 | `xsmall` 700 | 배지 · 태그 글자로 굵어진다 |
| `button` | 31 | 16 · 800 | `button` 700 | 굵기 |
| `heading` | 30 | 21 · 700 sans | `hand-heading` Gaegu 22 | 시트 · 빈 상태 · 오류 제목이 손글씨가 된다. 제목이 아닌 곳 — `BackBar` 의 화면 이름(시안은 sans 굵은 글자), 가져오기 셀의 `+`(시안은 아이콘), 생성 진행 문구 `만드는 중…` — 은 손글씨로 바꾸지 않는다([결정 5](../decisions/junk-journal-design-system.md#여섯-가지-선택)) |
| `title` | 12 | 32 · 800 | 탭 화면 → 랜섬 SVG 테이프 라벨, 그 밖 → `hand-title` | |
| `subtitle` | 2 | 26 · 700 | `hand-subtitle` | |
| `note` | 60 | 11 · 700 sans | 수 · 시간 메타 → `data` · `data-sm`, 상태 배지 → `xsmall` 태그 | 쓰임에 따라 갈라진다 |
| `edge` | 3 | 11 · 600 mono | `data-sm` | 내장되지 않은 600 굵기 문제도 같이 사라진다 |
| `eyebrow` | 1 | 12 · 800 대문자 | `data-sm` 대문자(`GUEST CHECK` 처럼) | |
| `link` · `linkPrimary` | 1 · 3 | 14 · 500/700 | `jj-textbtn` — 14 · 700 `ink` + 분홍 형광펜 밑줄 | 글자 버튼이 빨간 글자가 아니게 된다 |
| `display` · `code` | 0 · 0 | | 없음 | 지운다 |

[cookbook §14](../../apps/mobile/docs/conventions/cookbook.md#14-consuming-the-design-system)의 "마이크로 라벨은 문자
체계로 역할을 고른다"(`edge` ↔ `note`) 규칙은 D2Coding 을 내장하므로([결정 2](../decisions/junk-journal-design-system.md#여섯-가지-선택))
토큰을 이식할 때 없앤다.

## 3. 간격 · 모서리 · 그림자 · 크기

| 축 | 현행 | 시안 | 대응 |
|---|---|---|---|
| 간격 | `Spacing` `half`–`eight` = 2 · 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 | `space-2`–`space-64` | 값이 같다. 이름은 현행을 유지한다 |
| 모서리 | `Radius` `xsmall`–`xlarge` 4–24(91곳) · `pill`(18곳) | `radius-cut` 0 · `radius-disc` 50% | `xsmall`–`xlarge` → 0. `pill` → 원래 둥근 물건(단추 스티커 · 촬영 단추 · 가격 스티커 · 릴)만 원, 알약 모양 칩 · 태그는 네모난 테이프 칩. 둥근 프레임이 사라져도 `overflow: 'hidden'` 안의 `hitSlop` 제약은 그대로다 |
| 그림자 | 토큰 없음. `SnaplyButton` 주 버튼의 `glow` | `shadow-paper` `1px 2px 0` · `shadow-pressed` `0 1px 0`(밤은 검정 45%) | RN `boxShadow` 로 새 토큰. `glow` 는 지운다 |
| 기울기 | 없음 | `tilt-paper` 3° · `tilt-thumb` 2° · `tilt-control` 1.5° · `tilt-media` 0° | 새 축. 항목 id 해시로 각도를 고정한다(같은 항목은 늘 같은 각도). 터치 영역은 회전하지 않고 겉면만 기운다. 본문 글자 덩어리는 회전하지 않는 것을 제안한다 — Android 에서 회전한 글자는 계단이 생긴다 |
| 터치 최소 | `BackBar` 44dp | `touch-min` 44 | 48dp([결정 4](../decisions/junk-journal-design-system.md#여섯-가지-선택)) — 첫 출시가 Android 다 |
| 버튼 높이 | `SnaplyButton` `minHeight` 56 | `ticket-height` 48 | |
| 촬영 단추 | `CaptureSize` 52 | `capture-disc` 56 | 탭 바 위로 18px 튀어나온다 |
| 탭 바 높이 | `TabBarContentHeight` 52 + 블러 | 스텁 48 + 위아래 여백 10 · 12 | `useTabBarHeight()` 를 쓰는 화면의 아래 여백이 모두 바뀐다 |
| 비활성 | `opacity` 0.42(2곳), 그 밖은 곳마다 | `opacity-disabled` 0.5 | 하나로 모은다. 입장권 버튼만은 투명도 대신 바랜 종이 — 겉면 `paper-edge` · 글자 `ink-muted`([결정 9](../decisions/junk-journal-design-system.md#캔버스-검토-뒤-더한-선택)) |
| 종이 무늬 | 없음 | `rule-pitch` 24 · `margin-x` 32 | 종이 바탕 컴포넌트 전용 |

## 4. 모션

| 시안 | 현행 | 대응 |
|---|---|---|
| `settle` 0.55s `cubic-bezier(.3,.9,.4,1)` — 종이가 내려앉음 | `FadeInView` | `FadeInView` 를 settle 로 |
| `peel` 0.4s ease-in — 떼어 냄 | 없음 | 삭제 · 닫기 |
| 카세트 릴 회전 1.6s | `ActivityIndicator`(6개 파일) · 진행 링 | 로딩 표시를 릴로 |
| 축하 낙하 0.65s · 색종이 1.6s | **없음** | 새 동작이다 — [§5](#5-컴포넌트)의 완성 축하 |
| 동작 줄이기 → 0.2s 페이드, 릴 정지, 색종이 없음 | 시트 · `FadeInView` · 탭 · 타임라인 · 촬영은 `useReducedMotion` 을 읽는다. 스플래시 · 컷 플레이어 전환은 읽지 않는다 | 새 모션은 모두 `useReducedMotion` 을 읽는다 |

## 5. 컴포넌트

방식: **겉모습** = 구조와 동작은 그대로 두고 스타일만 바꾼다 · **구조** = 레이아웃이나 상호작용이 바뀐다 ·
**새로** = 현행에 대응이 없다.

| 시안 (`bundle.css` 클래스) | 현행 | 방식 | 메모 |
|---|---|---|---|
| 종이 바탕 `jj-page` · `--grid` · `--plain` | 화면마다 `backgroundColor: theme.background` | 새로 | 괘선 · 격자 · 여백선을 SVG 패턴으로, 스크롤과 함께 움직인다 |
| 종이 조각 `jj-paper` · 모서리 `jj-edge-torn-*` · `-perf` · `-deckle` | `View` + `Radius` + `backgroundElement` | 새로 | 시안은 CSS `clip-path` 로 그렸다. RN 에는 이 스타일이 없어 `react-native-svg` 경로로 그린다. 긴 목록의 칸에는 쓰지 않는 것을 제안한다(스크롤 성능) |
| 마스킹 테이프 `jj-tape` | 없음 | 새로 | 장식 — 접근성 트리에서 숨긴다 |
| 입장권 버튼 `jj-ticket` `--primary` · `--secondary` · `--ai` · `--danger` | `SnaplyButton` `primary` · `secondary` · `ai` · `ghost` | 겉모습 | `danger` 변형을 더한다. `ghost` 는 글자 버튼으로 |
| 글자 버튼 `jj-textbtn` | `SnaplyButton` `ghost` · `link` 글자 | 겉모습 | |
| 단추 스티커 `jj-button-sticker` | `BackBar` 동작 · 곳곳의 아이콘 `Pressable` | 새로 | 공용 아이콘 버튼 하나로 모은다 |
| 아이콘 `jj-icon`(24 격자 손그림 선) | Ionicons(17개 파일) | 새로 | 시안 보드의 약 30개에 캔버스가 더 그린 아이콘(소리 · 카메라 전환 · 영상 변경 · 자르기 등)이 있다. 세트는 캔버스에서 모으고, 나머지는 같은 규칙으로 그린다 |
| 메모장 입력란 `jj-field` | `TextField` · `FormTextField` | 겉모습 | 밑줄 하나 + 오류는 `cherry-ink` |
| 똑딱단추 토글 | RN `Switch`(무비 세부 시트 · 설정의 알림 · 스냅 분석 · 앨범 저장) | 새로 | |
| 체크 스티커 `jj-check` · 꿰맨 라디오 `jj-radio` | 화면 테마 · 전환 시트의 라디오 행 | 겉모습 | |
| 테이프 칩 `jj-tapechip` | 무비 칩(스타일 · 세부) · 관심사 알약 | 겉모습 | |
| 태그 `jj-tag` `--draft` · `--making` · `--done` · `--failed` · `--butter` · `--pink` | `movie-status-badge` · `snap-cell` 배지 | 겉모습 | 초안 = `sheet` · 만드는 중 = `sky` · 완성 = `mint` · 실패 = `cherry` · 올리는 중 = `butter` · 만료 임박 = `pink` |
| 가격 스티커 `jj-price` | 고른 스냅의 순번 · 크레딧 숫자 | 겉모습 | |
| 테이프 라벨 제목 · 날짜 영수증 `jj-titlelabel` · `jj-datestub` | 탭 화면의 `ThemedText` `title` | 새로 | 랜섬 SVG 제목 |
| Guest Check `jj-check-strip` | 스냅 탭 요약 줄 · 템플릿 카드 | 겉모습 | |
| 영수증 · 영수증 줄 `jj-receipt` · `jj-row` | 나 탭 설정 행 · `movie-row` | 겉모습 | 값은 `receipt-blue` 고정폭, 점선 리더 |
| 포스트잇 토스트 `jj-note` | `Toast` | 겉모습 | 사라지는 알림 전용 |
| 알림 띠 `mv-notice` · 느낌표 `jj-bang` | `refusal-notice` · `left-out-notice` · `movie-failure-notice` | 겉모습 | 고정 안내 — 생성 거절도 머리 아래 이 띠 자리에 둔다 |
| 오류 카드 `jj-alert`(캔버스 `jj-overrides.css`) | 스냅 업로드 실패 · 촬영 · 가져오기 오류 띠 | 새로 | 흰 카드 + `cherry-ink` 글자 하나로 모은다 |
| 노트 바텀 시트 `jj-sheet` · `jj-scrim` | `BottomSheet` | 겉모습 | 위 테두리에 펀치 구멍 · 스프링. 슬라이드 동작은 그대로 |
| 폴라로이드 `jj-polaroid` · `--916` · `--stage` | `ImageFrame` · `VideoFrame` · `snap-cell` · 무비 무대 | 겉모습 | 무대(`--stage`)는 기울이지 않는다 |
| 카세트 키 `jj-key` | 재생 · 되돌리기 · 다시 실행 | 겉모습 | |
| 카세트 릴 `jj-reel` | `ActivityIndicator` | 겉모습 | |
| 만들기 진행 영수증(`mv-order` "ORDER · 주문서") | `progress-ring` | 구조 | 링 대신 단계 목록 + %. 단계 문구와 진행률의 짝은 시안이 아니라 `apps/mobile/src/features/compose-movie/lib/edit-step-label.ts` 를 따른다 — 시안은 `자막 넣는 중` 단계를 빠뜨렸고 % 짝이 다르다 |
| 타임라인 `jj-timeline` · `jj-ruler` · `jj-seam` · `jj-playhead` · `jj-addclip` | `timeline-strip` · `timeline-cut` | 겉모습 | 시안은 1초 = 30px, 현행 `TimelinePxPerSec` 는 120 이다. 배율은 트림 정밀도와 묶여 있어 겉모습을 바꾸면서 같이 바꾸지 않는다 |
| 티켓 탭 바 `jj-tabbar` · `jj-stub` · `jj-capture` | `apps/mobile/src/_app/routes/app-tabs.tsx`(BlurView · Ionicons) | 구조 | 블러를 없애고 크래프트 띠로, 고른 탭은 분홍 스텁이 4px 올라온다. 높이는 [§3](#3-간격--모서리--그림자--크기) |
| 요일 스티커 고리(나 탭 "이번 주 4일 기록") | `week-ring` | 겉모습 | 고리 모양과 가운데 이름 첫 글자는 그대로 두고, SVG 호 7개를 요일 글자가 적힌 둥근 스티커 7개로 바꾼다(기록한 날 = `cherry`, 안 한 날 = 점선 테두리) |
| 빈 상태 · 스케치 `jj-empty` · `jj-sketch` | 없음(스켈레톤 없음) | 새로 | |
| 완성 축하(`완성!` 랜섬 · 영수증 꼬리 · 색종이) | **없음** | 새로 | 화면 모양이 아니라 **새 동작**이다. 넣으려면 [specs/](../specs/README.md)의 무비 요구와 기능 문서 `apps/mobile/docs/features/movie.md` 를 먼저 고친다 |

## 6. 시안만으로 정해지지 않던 것

여섯 가지는 2026-10-17 에 이 문서의 제안 그대로 정했다. 값 · 근거 · 기각한 대안은
[decisions/junk-journal-design-system.md](../decisions/junk-journal-design-system.md#여섯-가지-선택)가 원천이고, 위 표들은 그 결과를 반영했다.

1. AI 글자 · 선 색 → 새 토큰 `lavender-ink`
2. 데이터 고정폭 → D2Coding 400 · 700 내장, Pretendard 는 400 · 700 만
3. 밤 탭 바 → 새 토큰 `tabbar`(밤 값 포함)
4. 터치 최소 → 48dp
5. 손글씨 → 제목인 `heading` 에만
6. 촬영 · 가져오기 화면 → 다크 고정 유지, 단추 · 라벨에만 토큰

캔버스 검토 뒤 더한 세 가지(글자 단계 · 촬영 영역 시트 · 비활성 입장권)와 쓰임 규칙은
[결정 문서](../decisions/junk-journal-design-system.md#캔버스-검토-뒤-더한-선택)에 있다.
