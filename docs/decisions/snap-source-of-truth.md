# 스냅 관리 정책 전환 — 서버 원천(source of truth) 및 스토리지 용량 정책

**작성일**: 2026-08-11
**상태**: 결정 — 스냅 원천을 서버로 전환하고 Free 원본 스냅 용량을 5GB로 제한한다.
**범위**: 정책 결정과 근거를 기록한다. §4·§5의 스키마와 이행 순서, §6.4의 집행 방식은
결정 당시 구현 초안이며 작업 상태를 관리하지 않는다.
**후속 작업의 원천**: [backlog.md](../backlog.md) A-4(스냅 세부 정책),
A-2(유료 플랜 한도), E-3(GC 배치)
**후속 결정**: 2026-08-14에 Free 한도가 5GB → **2GB**로 축소됐다 —
[storage-and-subscription-policy.md](./storage-and-subscription-policy.md). 그 결정이 §6.1의
한도 값, §6.2에서 2GB를 기각했던 판단, §6.3의 원가 계산을 대체한다. §6.1의 **산정 범위(원본
스냅만)와 초과 시 동작(업로드 차단 + 로컬 보관)은 유효하다.**

관련: [plan-limits.md](./plan-limits.md), [api-spec.md](../api-spec.md)

---

## 1. 결정 요약

| 항목 | 결정 |
|---|---|
| 원천 모델 | **서버가 원천, 디바이스 로컬은 캐시** (현행: 로컬 원천 + 파일만 백그라운드 업로드) |
| 업로드 원칙 | 촬영/추출 즉시 자동 업로드 (현행 유지) + **메타데이터 동봉** (신규) |
| 촬영 시각 | **`capturedAt` 수집** — 위치 정보와 분리해 결정 완료 |
| 멱등성 | 클라이언트 생성 UUID(`clientId`)를 `(userId, clientId)` unique로 집행 |
| 삭제 | soft delete + **유예 기간 후 실삭제** (현행 즉시 실삭제에서 변경) |
| 크로스 플랫폼 재생 | ingest에서 H.264/SDR 배포 렌디션 생성, **원본은 무변형 보존** |
| 스토리지 한도 | **용량(GB) 기반**, Free **5GB**, 산정 대상은 **원본 스냅만** |
| 한도 초과 시 | **신규 업로드 차단 + 로컬 보관** ("백업 안 됨" 상태 명시, 해제 시 자동 재개) |

무비(편집 결과물) 생성은 스토리지 한도와 별개로 **크레딧 기반 결제**로 과금할 예정(미구현,
기획 중). 따라서 [plan-limits.md](./plan-limits.md) §2의 "월 3편" 모델은 크레딧 기획이
확정되면 대체될 수 있다.

## 2. 배경 — 왜 서버 원천인가

현행 구조의 문제:

- 무비 렌더는 이미 100% 서버 S3 파일 기준(`edit-job.service.ts`, `worker.py`)인데,
  라이브러리의 원천은 앱 로컬 JSON(`snaply.snaps`)이다. 서버에는 파일 바이트와
  `durationSeconds`만 있고 `capturedAt`·해상도·촬영/추출 구분이 없어 **서버 데이터만으로
  라이브러리를 재구성할 수 없다.**
- 앱 삭제/기기 변경 시 스냅·무비가 영구 소실되고, 업로드된 파일은 참조 불가능한 고아로 남는다.
- 아이폰+안드로이드를 함께 쓰는 유저의 스냅이 계정 단위로 합쳐 보이지 않는다.

## 3. 업계 조사 요약 (2026-08-11)

세 갈래(사진 동기화 서비스 / 숏폼 앱 / 업로드·트랜스코딩 기술)로 조사했다.

### 3.1 원천 모델

| 서비스 | 원천 | 앱 삭제/재설치 시 | 비고 |
|---|---|---|---|
| iCloud Photos | 서버 | 로그인 시 복구 | 로컬은 LRU 자동 축출 캐시(Optimize Storage), 원본 무변형 보존 |
| Google Photos | 서버(백업 후) | 복구 — 로컬 다운로드 없이 스트리밍 | 메타데이터+썸네일 먼저, 파일은 온디맨드 |
| Snapchat Memories | 서버 | 복구(백업 완료분만) | 업로드 진행 상태를 UI로 명시(Backup Progress) |
| BeReal / Locket | 서버 | 복구 | 카메라 중심 앱은 대체로 처음부터 서버 원천 |
| Instagram/TikTok 드래프트 | 로컬 | **영구 소실** | 소실 불만 만성적, 공식 대응 사실상 없음 |
| 1SE | 로컬 + 유료 백업 | 백업 없으면 소실 | 서버 합성이 핵심인 우리에겐 부적합 |

- 서버에서 AI 합성을 하는 서비스(Google Photos 하이라이트)는 예외 없이 원본의 서버
  업로드가 전제. Apple Memories만 온디바이스 처리를 택했고 그 대가로 모델 규모에 제약.
- **결론: 서버 합성이 핵심 가치인 이상 서버 원천이 자연스러운 종착점.**

### 3.2 기술 패턴 (표준)

- **멱등성**: 업로드 세션 생성 API에 클라이언트 생성 UUID 멱등키(Stripe 패턴).
  Cloudflare Stream의 "uid 선발급 → 업로드 → 동일 ID 추적"은 우리 `upload-url`의
  pending 선생성과 동형 — 여기에 `clientId`만 얹으면 표준에 부합.
- **finalize 3중 구조**: 클라이언트 confirm(+S3 HEAD 검증, 이미 구현됨)
  + S3 ObjectCreated 이벤트 안전망(confirm 유실 회수) + **pending TTL 정리**
  (tus `Upload-Expires`, Mux `timed_out`과 동일 사상).
- **트랜스코딩**: "입력은 관대하게, 배포는 정규화" (Instagram/YouTube/Stream 공통).
  원본(HEVC/돌비비전 포함) 불변 보존 + ingest에서 H.264/AAC/SDR 렌디션 + 썸네일 자동 생성.
  근거: iPhone HDR 기본값은 HEVC 10bit + 돌비비전 P8.4인데 Android 기기의 약 35%는
  HEVC HW 디코딩이 없고 ExoPlayer의 돌비비전 처리 실패(색 빠짐)가 다수 보고됨.
  ffmpeg 재인코딩 시 회전(display matrix)도 autorotate로 자동 정규화된다.
- **삭제**: soft delete + 유예(iCloud 30일, Google Photos 60일) + 전 기기 전파.
  "어디서나 삭제"와 "이 기기에서만 제거"를 API 레벨에서 구분.
- **메타데이터**: 원본 파일은 절대 수정하지 않고 표시용 값을 오버레이로 저장(Google 모델).
  타임존은 GPS > EXIF Offset > 업로드 컨텍스트 순 폴백이 사실상 표준.
  DB의 width/height는 rotation 반영 후 값으로 기록.
- **복구 UX**: Google Photos 모델 — 재설치 시 메타데이터+썸네일만 동기화, 파일은 온디맨드.

주요 출처: Apple 지원 105061/HT204264/111762, Google Photos 도움말(6193313, 6128843,
9343482, 6220791), Dropbox Tech Blog(camera uploads), Snapchat Support/Newsroom(Memories
storage plans), tus.io/IETF resumable-upload draft, Mux/Cloudflare Stream/api.video 문서,
ExoPlayer #9794(돌비비전 fallback), AWS MediaConvert 자동 회전 문서.

### 3.3 경고 사례

Snapchat은 약 10년 무료였던 Memories에 2025년 용량 제한(무료 5GB, 100GB $1.99/월)을
도입했다가 대규모 반발을 겪었다. **서버 원천은 스토리지 비용이 영구 부채로 쌓이므로,
한도를 처음부터 명시해야 한다** — 본 문서 §6의 용량 정책이 서버 원천 전환과 함께 가는 이유.

## 4. 결정 당시 스키마 변경안 (1단계)

> 구현 작업의 상태나 확정 계약이 아니라, 결정의 실현 가능성을 검토한 초안이다.
> 실제 착수 범위는 [backlog.md](../backlog.md)에서 관리하고 API가 바뀌면
> [api-spec.md](../api-spec.md)를 함께 갱신한다.

별도 `Snap` 테이블 대신 **`Video`(kind=source) 확장**. `EditJob`/`SnsUpload`/워커/앱의
`videoId` 매핑이 전부 `Video`를 참조하므로 분리 비용이 크다. 스냅 전용 필드는 nullable.

설계 원칙: **의미값은 컬럼, 원시값은 JSON.** iOS(.mov/HEVC, transform 행렬 회전,
creation_time UTC)와 Android(.mp4, rotation 힌트, 촬영 시각 기록 비일관)가 같은 정보를
다르게 기록하므로, 클라이언트가 정규화한 표시 기준 값만 컬럼에 넣고 플랫폼 원시값은
`captureMeta` JSON에 보관한다.

```prisma
model Video {
  // ... 기존 필드 유지 ...

  // 스냅(kind=source) 메타데이터 — 서버 원천화 1단계
  clientId            String?   @map("client_id") @db.VarChar(64)   // 클라이언트 생성 멱등키
  capturedAt          DateTime? @map("captured_at") @db.Timestamptz(6) // 앱 시계 기준(파일 메타데이터 아님)
  capturedTzOffsetMin Int?      @map("captured_tz_offset_min")      // 로컬 시간 의미 복원용 (KST=540)
  durationMs          Int?      @map("duration_ms")                 // 최초엔 클라이언트 값, FFprobe 후 서버 측 실측값으로 교정
  width               Int?                                          // 표시 기준(회전 적용 후)
  height              Int?
  orientation         String?   @db.VarChar(20)                     // portrait|landscape|square
  snapSource          String?   @map("snap_source") @db.VarChar(20) // captured|extracted
  platform            String?   @db.VarChar(20)                     // ios|android
  mimeType            String?   @map("mime_type") @db.VarChar(100)
  sizeBytes           BigInt?   @map("size_bytes")                  // confirm 시 S3 HEAD 값 — 쿼터 집행 근거
  captureMeta         Json?     @map("capture_meta")                // 플랫폼 원시값(rotation, 인코딩 해상도, codec, hdr, 기기모델 등)

  @@unique([userId, clientId])
}
```

- `@@unique([userId, clientId])`: Postgres에서 NULL은 충돌하지 않으므로 기존 행·result 행과 공존.
- `orientation`/`snapSource`는 이 스키마의 `status` 관례에 맞춰 varchar (enum 아님).
- `durationMs`는 업로드 등록 시 클라이언트 값을 초기값으로 받되, 최초 서버 측 미디어 처리
  (영상 분석 또는 ingest)에서 FFprobe 실측값으로 교정한다. 교정 후 `durationMs`가 길이의
  서버 원천이며, `durationSeconds`는 하위호환용으로 이 값에서 파생 저장한다.
- `sizeBytes`: `confirmUpload`의 기존 HEAD 검사 결과를 저장만 하면 됨. §6 쿼터 집행의 근거.
- **위치(`place`)는 제외** — 앱의 명시적 프라이버시 설계("서버로 안 나감")를 뒤집는 제품
  결정 선행 필요. 결정 시 `capturedLat/Lng` 컬럼 추가.

API 계약:

- `GET /videos/upload-url` + `clientId`(optional): 기존 `ready` 행이면
  `{ videoId, alreadyUploaded: true }` 반환(PUT 생략), `pending`이면 **행 재사용 + URL
  재발급**(재시도마다 쌓이던 pending 고아 억제), 없으면 생성.
- `POST /videos` 바디 확장(전부 optional — 구버전 앱 호환): `clientId`, `durationMs`,
  `capturedAt`, `capturedTzOffsetMin`, `width`, `height`, `orientation`, `snapSource`,
  `platform`, `captureMeta`(8KB 상한). 이미 `ready`면 400이 아니라 200 + 기존 행(멱등).
- 등록 시 클라이언트 메타데이터는 범위 체크 후 초기값으로 신뢰한다. 파일에서 확인 가능한
  길이는 최초 서버 측 미디어 처리에서 FFprobe로 교정하고, 나머지 파일 대조 검증은 ingest
  렌디션 파이프라인(2단계)에서 수행한다.

앱 대응: `snap.id`를 UUID로 전환(현행 파일명 기반은 기기 간 충돌 가능), register 페이로드
확장, **촬영 스냅 해상도 하드코딩(1080×1920) 해소가 선행 과제로 승격**(틀린 값이 서버
원천이 되면 백필 불가).

## 5. 결정 당시 검토한 이행 순서

> 아래 표는 작업 목록이 아니다. 선후관계의 근거만 보존하며 실제 미완료 작업은
> [backlog.md](../backlog.md)에서만 관리한다.

| 단계 | 내용 | 비고 |
|---|---|---|
| **1. 스키마+업로드** | §4 마이그레이션(순수 additive), upload-url/confirm 확장, 앱 메타데이터 전송, **쿼터 집행(§6)** | 기존 업로드분은 메타데이터 백필 불가 — `capturedAt IS NULL`이면 `createdAt` 폴백 |
| **2. ingest 렌디션** | confirm 후 워커가 FFprobe로 `durationMs`를 교정하고 H.264/SDR 배포본 + 썸네일 생성(원본 보존), `Video`에 렌디션 키 컬럼 추가 | 분석 워커가 먼저 실측했다면 같은 값을 재사용. 크로스 플랫폼 재생의 전제 — reconcile보다 먼저 |
| **3. 복구/동기화** | 앱 reconcile(서버 목록 대조, 파일 온디맨드), 삭제 유예·전파 규칙 | Google Photos 모델 |
| **4. 무비 동기화** | 평면 `Video`를 참조하는 `Movie` 엔티티 + CRUD, 앱 `snaply.movies` 전환 | 엔티티는 `Movie`로 결정. 재내보내기·삭제 연동 등 세부 정책은 [backlog.md](../backlog.md) A-1 |
| **병행** | GC 배치: ① pending TTL(예: 24h) 회수 ② 삭제 유예 만료분 S3 실삭제 ③ S3 삭제 실패분 정리(`video.service.ts:205` 주석의 미구현 배치) | finalize 안전망(S3 이벤트)은 선택적 후속 |

## 6. 스토리지 용량 정책

### 6.1 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 한도 단위 | **용량(GB)** | Snapchat·iCloud·Google 전부 이 방식. 집행 단순(누적 바이트 합산), 요금제 커뮤니케이션 명확 |
| Free 한도 | **5GB** (스냅 평균 8MB 기준 약 600개) | Snapchat Memories 무료 한도와 동일. 라이트 유저 6개월~1년치. §6.3 원가 |
| 초과 시 동작 | **신규 업로드 차단 + 로컬 보관** | iCloud·Snapchat과 동일. 촬영은 계속 가능하되 "백업 안 됨" 배지 명시, 한도 해제(업그레이드/삭제) 시 업로드 워커가 자동 재개 — 현행 워커 구조로 가능 |
| 산정 범위 | **원본 스냅(`kind=source`)만** | 렌디션·썸네일(서비스 파생물)과 무비 결과물은 서비스 비용으로 흡수. "내가 찍은 것만 계산"이 유저 입장에서 공정, Mux 등 인프라 서비스 관행과 일치 |

무비 생성 과금은 스토리지와 분리해 **크레딧 기반 결제**로 설계 예정(미구현). 무비
결과물(`kind=result`)이 쿼터에서 빠지는 것은 이 분리 전제와 일관된다.

### 6.2 검토했던 옵션

한도 단위:

- **용량(GB) 기반 — 채택.**
- 스냅 개수 기반: 유저 직관성은 높으나 스냅 길이·화질에 따라 실제 비용이 2배까지
  차이나고, 개수로 안 세지는 저장물과 혼합될 때 규칙이 복잡해져 기각.
- 하이브리드(집행은 용량, 표기는 "약 N개 분량" 환산): 기각이라기보다 보류 —
  앱 표시 레이어에서 환산 표기를 얹는 것은 추후 UX 결정으로 열어둠.

Free 한도:

- **5GB — 채택.** 초기부터 한도를 명시해 "나중에 과금 전환" 신뢰 리스크(Snapchat 사례) 차단.
- 2GB(~250개): 체험판 성격. 헤비 유저가 1개월 내 도달해 전환 압박은 빠르지만 무료
  유저 이탈 리스크로 기각.
- 10GB(~1,200개): 초기 성장 우선. 원가는 여전히 낮으나(월 ~₩490/유저) 한 번 준 한도를
  줄이는 것은 사실상 불가능(Snapchat 반발 사례)해 기각.

초과 시 동작:

- **업로드 차단 + 로컬 보관 — 채택.**
- 10% 유예 후 차단: 촬영 중 갑작스런 차단 경험은 줄지만 집행 로직·안내 문구가 복잡해져 기각.
- 업로드 계속 허용 + 무비 생성만 차단: 서버 원천 원칙엔 부합하나 스토리지 비용이
  무한정 열려 어뷰징에 취약해 기각.

산정 범위:

- **원본 스냅만 — 채택.**
- 원본 + 무비 결과물: 계산은 일관되나 "무비를 만들수록 한도가 준다"는 인상이 핵심 가치
  사용을 위축. 무비는 크레딧 과금으로 분리하므로 기각.
- 모든 저장물(렌디션·썸네일 포함): 원가 반영은 정확하나 유저가 통제할 수 없는 파생물이
  한도를 먹는 구조라 설명 불가능. 기각.

### 6.3 원가 계산

전제: 스냅 평균 8MB(3~5초 1080×1920, iOS HEVC ~4-6MB / Android H.264 ~6-10MB의 중간값),
2단계 이후 스냅당 파생물 — H.264 렌디션 ~3MB + 썸네일 ~0.05MB. 즉 **유저에게 보이는
1GB당 실저장 약 1.4GB**(파생물 계수 1.4). S3 서울 리전 Standard $0.025/GB·월, 환율
₩1,400/$ 가정.

| 시나리오 | 유저 가시 용량 | 실저장(×1.4) | 월 스토리지 원가 |
|---|---|---|---|
| Free 한도 꽉 채운 유저 | 5GB | 7GB | $0.175 ≈ **₩245** |
| 라이트 유저(하루 2~3개, 월 ~0.5GB) 1년 | 6GB | 8.4GB | $0.21 ≈ ₩295 |
| 헤비 유저(하루 10개, 월 ~2.4GB) — Standard 가정 | 30GB/년 | 42GB | $1.05 ≈ ₩1,470 |

- Free 유저 1만 명이 전원 한도를 채워도 월 ~₩245만 — 감당 가능한 수준.
- 전송(egress) 비용은 별도: CloudFront 서울 ~$0.114/GB. 복구/멀티 디바이스 다운로드가
  많아지면 스토리지보다 전송이 지배적일 수 있음 — 2단계에서 렌디션(원본보다 ~60% 작음)을
  기본 다운로드로 쓰면 절감된다. 실측 후 재평가.
- 절감 옵션(추후): 오래된 원본의 S3 IA/Glacier IR 이동(30일 미접근 기준 ~46-68% 절감).
  Snapchat도 오래된 Memories를 콜드 스토리지로 옮긴다.

Standard/Premium 한도는 이 결정의 범위에서 제외했다. 결정 당시 검토값은
Standard(₩9,900) 100GB, Premium(₩24,900) 500GB였으나 Premium은 월 스토리지 원가가
약 ₩24,500이라 300GB 대안도 있었다. 이 값들은 정책이 아니며 유료 플랜 결정의 원천은
[backlog.md](../backlog.md) A-2다.

### 6.4 결정 당시 집행 설계안

- 근거 데이터: `Video.sizeBytes`(§4) — `confirmUpload`의 기존 S3 HEAD 결과를 저장.
- 사용량 = `SUM(sizeBytes) WHERE userId AND kind='source' AND deletedAt IS NULL`.
  초기엔 쿼리로 충분(유저당 수백~수천 행). 성능 이슈 시 `User.storageUsedBytes` 캐시
  컬럼 + 트랜잭션 증감으로 전환.
- 집행 지점 2곳:
  1. `GET /videos/upload-url` — 사용량 ≥ 한도면 403 `STORAGE_LIMIT_EXCEEDED`(신규 에러
     코드). 응답에 사용량/한도를 실어 앱이 배지·업그레이드 유도 표시.
  2. `POST /videos`(confirm) — HEAD 크기 반영 후 재확인(발급~업로드 사이 경합 방어).
     초과분 1건은 허용하고 이후 차단(엄격 롤백보다 단순, 오차는 스냅 1개 크기 이내).
- 삭제 시 유예 기간 중인 스냅(soft deleted)은 사용량에서 **즉시 제외**(유저 입장에서
  "지웠는데 한도가 안 줄어듦"을 피함). 유예 만료 후 GC가 실삭제.
- 한도 조회 API: `GET /billing/usage` 또는 `GET /me/storage` — 앱의 "OO GB 중 OO GB
  사용" 표시용. 앱은 한도 도달 스냅에 "백업 안 됨" 배지 + 업로드 워커가 403 시 해당
  스냅을 `blocked` 상태로 기록(무한 재시도 방지), 한도 변화 이벤트 시 재개.

## 7. 결정 범위 밖의 후속 작업

이 문서는 후속 작업의 세부 목록이나 완료 여부를 갱신하지 않는다. 스냅 전환의 추가 판단은
[backlog.md](../backlog.md) A-4, Standard/Premium 스토리지 한도와 무비 과금 정책은 A-2,
S3 삭제 실패분 정리 배치는 E-3이 유일한 원천이다. 작업을 닫을 때는 이 문서가 아니라
해당 백로그 항목을 갱신한다.
