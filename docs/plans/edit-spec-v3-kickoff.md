# editSpec v3 착수 계획 — 스펙 · 에셋 매니페스트 · 어휘 사전

**작성일**: 2026-08-20 · **상태**: 부분 구현 — **커밋 1~3(어휘 사전·시드·무효화 규칙)은 완료됐다**
([progress.md](../progress.md) 2026-08-20, [backlog.md](../backlog.md) A-7). **남은 것은 §6 커밋 4
(두 초안의 잔여 개정)뿐이며**, 그 절 외의 내용은 완료된 작업의 기록이지 작업 지시가 아니다.

상위 계획은 [trend-editing-pipeline.md](./trend-editing-pipeline.md), 미결 결정은
[backlog.md](../backlog.md) A-7 에만 둔다. 현행 계약은 [api-spec.md](../api-spec.md),
현행 파이프라인의 사실은 [progress.md](../progress.md) Phase 5 에 있다.

관련 결정: [storage-and-subscription-policy.md](../decisions/storage-and-subscription-policy.md) §3
· [snap-content-analysis.md](../decisions/snap-content-analysis.md)
· [movie-model.md](../decisions/movie-model.md)

---

## 0. 이 문서의 범위

**담는 것** — 스펙 초안 검토에서 수렴한 결정, 착수 순서, 첫 커밋의 실행 상세.

**담지 않는 것**

- **스키마 본문** — `editSpec` v3 와 에셋 매니페스트의 필드 정의는 개정될 두 초안이 원천이다.
  이 문서는 그 개정에 **무엇을 반영해야 하는가**만 기록한다.
- **미결 결정** — [backlog.md](../backlog.md) A-7 에만 둔다. 여기에 체크리스트를 만들지 않는다.

---

## 1. 검토에서 확정된 것

착수 전 5회 검토에서 수렴한 결정이다. 개정 시 이 표가 반영 범위가 된다.

### 1.1 editSpec v3

| 항목 | 결정 | 근거 |
|---|---|---|
| A-1 | `version` 키 유지. `parseEditSpec` 폴백을 throw 로 | [edit-job.service.ts:64-88](../../apps/api/src/services/edit-job.service.ts#L64-L88) 이 알 수 없는 형태를 `{version:1, stylePreset:'일상'}` 으로 삼킨다 |
| A-1 | **큐 이름 분리** (`edit-v3`) | 아래 §1.4 |
| A-2 | `seed: { root, attempt: { <stage>: n } }`. 스테이지 시드 = `sha256("{root}:{stage}:{attempt}")` 상위 8바이트 | 전역 `attempt` 는 부분 재생성과 충돌한다. 해시를 이름으로 박지 않으면 파이썬 `hash()` 가 `PYTHONHASHSEED` 로 프로세스마다 달라져 재현성이 사라진다 |
| A-3 | `grade` 레이어 신설 + `assetRefs` 에 `styleBundle`·`lutPack` | 현행 유일한 스타일 표현이 [editor.py:34-38](../../apps/ai-worker/src/pipeline/editor.py#L34-L38) 의 `eq=` 한 줄이다. v3 초안에 갈 자리가 없었다 |
| A-4 | `intent.subtitles` 추가. **필수 필드이며 스펙 레벨 기본값을 두지 않는다** — 요청 바디의 `subtitles?: boolean`(기본 `false`)은 그대로 두고 API 가 스펙을 만들 때 값을 채운다 | 큐 페이로드에만 있어([edit-queue.ts:17](../../apps/api/src/queue/edit-queue.ts#L17)) 레시피 재생성 시 자막 유무가 달라진다. 스펙에 기본값을 두면 A-1 의 "알 수 없는 형태는 실패" 원칙과 어긋난다 |
| A-5 | `analysis` 인라인 폐기 → `{ videoId, analysisVersion }` 참조 | `video_analyses` 테이블이 이미 있고 `@@unique([videoId, analysisVersion])` 로 행이 덮이지 않는다. 인라인은 [movie-recommendation.service.ts:262-297](../../apps/api/src/services/movie-recommendation.service.ts#L262-L297) 이 읽는 필드명과 갈라진다 |
| B-1 | **`output` 블록을 없앤다.** 기하(`width`·`height`·`fps`·`fitMode`)는 `renderSpec` 단독 권위 — editSpec 에 미러하지 않는다. 목표 길이는 `intent.targetDurationMs`, 실제 길이는 timeline 파생(B-2), `safeArea` 는 팩 참조(B-3) | `renderSpec` 이 이미 영구 저장되고 `profileVersion` 으로 검증된다([render_spec.py:33-49](../../apps/ai-worker/src/pipeline/render_spec.py#L33-L49)). 미러를 두면 어느 쪽이 이기는지를 매번 물어야 한다. `resolved.xy` 가 소스 정규화라 디렉터는 캔버스 기하를 알 필요가 없다 |
| B-2 | `durationMs` 는 파생값 — 인제스트 단계에서 뺀다 | 타임라인 이전에 알 수 없다 |
| B-3 | `safeArea` → 매니페스트의 **7번째 팩 타입** | 불변 버전 + 계속 서빙 + 갱신 주기가 다른 팩과 같다. 스펙에 값으로 굽으면 이미 저장된 스펙을 못 고친다 |
| B-4 | `audio.bgm` 은 믹스 파라미터만. 트랙은 `music` 참조 | 작성자가 다른 두 스테이지가 같은 사실을 쓴다 |
| B-5 | `transitions[].sfxId` 제거 | 효과음은 style-director 도메인. `audio.sfx[].sourceRef` 로 역참조가 이미 된다 |
| B-6 | `beatLength` 권위, 길이는 파생. 재투영이 원래 길이 ±20% 를 벗어나면 edit-director 재실행 | 컷 길이를 음악 단위로 정했으므로 BPM 변화가 길이를 바꾸는 것이 옳다 |
| B-7 | 앵커는 `(cutId, offsetInCutMs)`, 지속은 `durationMs`. 절대 ms · `atBeat` 는 파생 | 시각 표현 3중을 정리한다. **[trend-editing-pipeline.md](./trend-editing-pipeline.md) §3 의 "키프레임은 절대 시각(ms)" 문장을 같은 커밋에서 함께 고친다** |
| B-8 | `reason` 을 닫힌 코드 집합으로 (`{ code, detail }`) | 자유 문자열이면 `removedCutIds` → `reason` 집계가 문자열 파싱이 된다 |
| B-9 | `userEdits.locked` 대상을 열거형으로 | `"timeline.cuts.order"` 는 실재하지 않는 경로다 |
| B-10 | `source.clips[].uri` → `videoId` | 워커는 [worker.py:86](../../apps/ai-worker/src/worker.py#L86) `fetch_source_keys` 로 키를 해석한다. URI 를 구우면 스토리지 이전 시 과거 스펙이 죽고 소유권 검증을 우회한다 |
| — | `resolved.xy` 는 **소스 정규화** | 앵커의 출처(얼굴·손·객체 bbox)가 전부 소스 좌표계다. 캔버스 정규화면 저장 시점에 fit 변환이 섞여 `fitMode` 종속이 된다 |
| — | **"0~1 정규화"는 좌표계 진술이지 범위 보장이 아니다.** `resolved.xy` 에 범위 제약을 걸지 않는다 | 파생은 프레임 밖 좌표를 클램프하지 않는다 — 프레임 위에 붙은 얼굴의 `aboveHead` 는 음수가 맞다. 클램프는 실패를 성공으로 위장하는 변환이라 폴백 체인이 "붙였다"고 판단한다. 배치 가능 여부는 세이프에어리어를 아는 **배치 단계**가 정하며, 그래야 파생이 `derivationVersion` 에만 매이고 세이프에어리어 팩 버전과 독립이다. 실제 값은 `tests/fixtures/anchor-derivation.json` 의 경계 케이스에 있다(`chin` y=1.04, `beside` x=1.25) |

### 1.2 에셋 매니페스트

| 항목 | 결정 | 근거 |
|---|---|---|
| C-1 | 서버 렌더용은 **TTF/OTF**. 폰트는 `ass` 필터의 `fontsdir=` 로 LRU 캐시 디렉터리를 직접 가리킨다. 이미지에는 두부 방지용 기본 한글 폰트 하나만 굽는다 | woff2 는 웹 전용이라 libass/fontconfig 가 인식하지 못한다. 팩 폰트는 런타임에 도착하므로 빌드 타임 `fc-cache` 로는 안 잡힌다 |
| C-2 | `expiresAt: null` 필수. **`retired` 를 법적 차단 전용으로 좁히고 라이선스 만료를 사유에서 뺀다** → 상태 셋(`experimental → active → deprecated`) | "신규 생성 제외 + 기존 스펙 서빙"은 초안의 `deprecated` 정의와 같다. 이렇게 하면 [storage-and-subscription-policy.md](../decisions/storage-and-subscription-policy.md) §3 의 무료 재생성 약속을 고치지 않아도 된다 |
| C-3 | 파생 공식 명시 + `derivationVersion`. **핀은 editSpec 의 `assetRefs` 옆** | MediaPipe Face Detection 6키포인트에 `cheekL`·`cheekR`·`chin` 이 없어 파생이 필요하다. `resolved` 가 "무효화 가능한 캐시"인 이상 재계산 가능성이 곧 재현성이다 |
| C-4 | **톤매핑 → LUT** 순서를 파이프라인 계약으로 못박는다 | 현행에 톤매핑이 없다. BT.2020 PQ 소스에 rec709 LUT 를 태우면 색이 두 번 깨진다 |
| D-1 | `grain`·`vignette`·`halation` 을 LUT 아이템에서 분리 | `.cube` 는 `lut3d` 한 줄이고 halation 은 블러+블렌드 체인이다. 구현 비용이 다르다 |
| D-2 | `license` 는 아이템이 팩을 덮는다고 명시 | |
| D-3 | `attributionText`·`attributionUrl` 추가 | boolean 만으로는 무엇을 어디에 적을지 모른다 |
| D-4 | `minAppVersion` 을 클라이언트 전용으로 표시 | 워커는 앱 버전을 모른다 |
| D-5 | `triggerKinds` 가 전환 어휘의 상위집합임을 명시 (`"sticker"` 포함) | |
| D-6 | `moodTags` 어휘를 현행 `calm`·`upbeat`·`daily` 와 맞춘다 | [editor.py:34-38](../../apps/ai-worker/src/pipeline/editor.py#L34-L38) |
| D-7 | `peakOffsetMs` 프리롤의 경계 클램프 규칙 | 첫 전환에서 타임라인 0 이전이 된다 |
| D-8 | `sfx.gainDb` 는 매니페스트가 기본값, 스펙이 오버라이드 | |
| — | **재렌더는 레지스트리·번들을 다시 조회하지 않는다. 스펙에 핀된 `packId`·`assetId` 만 해석한다** | `rollout`·`bgm.filter`·`sceneAffinity`·`transitionWeights` 가 전부 같은 함정이다. 규칙 하나가 필드별 주의보다 낫다 |

### 1.3 어휘 사전 (E)

- **단일 원본 JSON** — `packages/shared-types/src/*-vocabulary.json`. 코드젠 없음, 수동 동기화 없음.
  커밋 1~3 에서 셋이 됐다: `anchor`(앵커 어휘) · `stage`(스테이지·시드 알고리즘) ·
  `invalidation`(재생성 규칙). Dockerfile 의 COPY 가 와일드카드라 넷째가 생겨도 안 고친다.
- **폴백 인코딩은 객체 배열로 통일.** `"face:aboveHead"` 문자열은 `offset` 을 담지 못해 확장 불가다.
- **매니페스트의 `defaultAnchor` 를 지운다.** `anchorAffinity[0]` 이 곧 기본값이므로 두 값이 어긋날 여지를 없앤다.
- **파생 공식은 파이썬 단독 구현.** `resolved` 를 계산하는 것은 MediaPipe 출력을 가진 워커뿐이고
  API 는 저장·응답만 한다. 크로스랭귀지 골든 테스트는 필요 없고, **파이썬 픽스처 테스트**
  (입력 키포인트 → 기대 좌표)로 충분하다. 두 번째 구현은 앱(Swift/Kotlin)이 프리뷰 배치를 하기로
  할 때 오며, 그때 이 픽스처가 그대로 계약이 된다.

### 1.4 A-1 을 큐 분리로 정한 근거

호환 필드 이중 기록은 **실패하지 않기 때문에** 탈락이다.

- [edit_spec.py:41](../../apps/ai-worker/src/pipeline/edit_spec.py#L41) `parse_job_clips` 는 페이로드
  **최상위** `clips` 를 `editSpec` 보다 먼저 본다
- [worker.py:71-72](../../apps/ai-worker/src/worker.py#L71-L72) 는 `editSpec["stylePreset"]` 만 읽는다 —
  v3 에 그 키를 남기면 통과한다
- `renderSpec` 은 별도 인자라 무관하다

즉 구버전 워커는 v3 작업을 **v2 로 성공적으로 렌더한다.** 스티커·비트·LUT 가 빠진 결과물이 `done`
으로 완료되고, [edit-jobs.ts:69](../../apps/api/src/routes/edit-jobs.ts#L69) 정책상 환급은 실패·취소에만
있으므로 **100크레딧이 그대로 소모된다.**

유료 export 에서 조용한 품질 저하는 시끄러운 실패보다 나쁘다. 실패는 환급되고 재시도되지만,
저하된 성공은 사용자가 돈을 내고 열등한 결과를 받는다.

---

## 2. 착수 순서

의존 순이다. 앞 단계가 닫히지 않으면 뒤가 근거를 잃는다.

| # | 내용 | 왜 이 순서인가 | 상태 |
|---|---|---|---|
| 1 | 어휘 사전과 빌드 컨텍스트 (§3) | 사전 없이는 스펙·매니페스트의 `anchor` 절을 쓸 수 없다 | ✅ 완료 (2026-08-20) |
| 2 | 스테이지별 `attempt` 와 해시 고정 (§4) | 무효화 표의 한 열이 여기서 나온다 | ✅ 완료 (2026-08-20) |
| 3 | 무효화 규칙 (§5) | A-2·A-5·B-6 를 한 사전이 흡수한다 | ✅ 완료 (2026-08-20) |
| 4 | 잔여 개정 (§6) | 위 셋이 정해진 뒤 기계적으로 반영된다 | ⏳ 남음 |

---

## 3. 커밋 1 — 어휘 사전과 빌드 컨텍스트

한 커밋이다. 사전 파일만 넣고 빌드를 나중에 고치면 **파일은 저장소에 있는데 이미지에는 없는
중간 상태**가 생긴다. AGENTS.md 의 "함께 있어야 완전한 변경은 같은 커밋에 둔다"에 해당한다.

⚠️ **이 커밋은 원자적이며 부분 롤백이 불가능하다.** §3.4 의 로더가 사전이 없으면 기동을
실패시키도록 설계돼 있으므로, compose·Dockerfile·로더 중 하나만 되감으면 편집 워커가 뜨지
않는다. 되돌릴 때는 커밋 전체를 revert 한다. 의도한 설계이며, 배포 담당자가 미리 알아야 한다.

### 3.1 빌드 컨텍스트를 루트로 통일한다

현재 워커는 [docker-compose.yml:115](../../docker-compose.yml#L115)·[142](../../docker-compose.yml#L142)
에서 `context: ./apps/ai-worker` 다. **`packages/` 가 컨텍스트 밖이라 파이썬이 읽을 파일이 런타임에
존재할 수 없다.**

API 가 이미 루트 컨텍스트를 쓴다([docker-compose.yml:80-81](../../docker-compose.yml#L80-L81)) —
새 규약이 아니라 워커만 예외였던 것을 맞추는 일이다.

**서비스가 둘이다.** `ai-worker`(편집)와 `analysis-worker`(분석)가 같은 이미지를 커맨드만 바꿔
쓰므로 양쪽 다 고친다.

```yaml
    build:
      context: .
      dockerfile: apps/ai-worker/Dockerfile
```

### 3.2 Dockerfile — 경로만 바뀌고 순서는 그대로다

[apps/api/Dockerfile](../../apps/api/Dockerfile) 이 참조 패턴이다(좁은 경로 유지).

```dockerfile
COPY apps/ai-worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY packages/shared-types/src/anchor-vocabulary.json ./
COPY apps/ai-worker/src/ ./src/
COPY apps/ai-worker/assets/ ./assets/
```

사전을 `src/` 앞에 두면 워커 코드를 고칠 때 사전 레이어가 안 깨진다.

**`COPY . .` 로 넓히지 않는다.** 그러면 문서 한 줄만 고쳐도 워커 이미지가 재빌드된다.

### 3.3 `.dockerignore` — 변경 없음, 다만 하나가 살아난다

앱별 `.dockerignore` 가 없으므로 워커가 루트 파일을 **처음으로** 쓰게 된다. 13줄을 대조한
결과 추가·삭제할 것이 없다 — `**/node_modules` · `**/dist` · `**/.venv` · `**/__pycache__` ·
`.git` · `.turbo` · `**/.env*` 가 전부 워커에도 맞는 제외다. 컨텍스트가 커질 걱정도 여기서
닫힌다(무거운 것은 전부 이 목록에 있다).

부수 효과로 [`.dockerignore:11`](../../.dockerignore#L11) `apps/ai-worker/assets/bgm/**/*.m4a` 가
**작동하기 시작한다.** 루트 상대 경로로 쓰여 있어 현행 컨텍스트에서는 no-op 이었다. A-7 의
음원 확보가 예정돼 있으므로 지금 살아나는 것이 맞다.

**부수 이득**: 사전을 `dist/` 가 아니라 `src/` 에 두기로 한 결정이 여기서 두 번째로 맞는다.
[`.dockerignore:2`](../../.dockerignore#L2) 의 패턴이 `dist/`(루트만)가 아니라 `**/dist` 라
`packages/shared-types/dist` 도 컨텍스트에 없다. 워커는 원본 JSON 을 직접 가져가고,
**워커 이미지가 Node 빌드에 의존하지 않는다.**

### 3.4 파이썬 로더 — `config.py` 의 선례를 따르되 실패 동작만 반대로

사전의 위치가 컨테이너(`/app/anchor-vocabulary.json`)와 네이티브 개발
(`<repo>/packages/shared-types/src/anchor-vocabulary.json`)에서 다르다. 이건 Dockerfile 로 안 풀린다.

[config.py:14-17](../../apps/ai-worker/src/config.py#L14-L17) 에 같은 문제의 해법이 이미 있다 —
`.env` 가 저장소에서는 `apps/api/.env` 인데 컨테이너에는 없어서 후보 목록으로 처리한다.

```python
VOCAB_CANDIDATES = (
    WORKER_ROOT / "anchor-vocabulary.json",                                      # 컨테이너
    REPO_ROOT / "packages" / "shared-types" / "src" / "anchor-vocabulary.json",  # 네이티브
)
```

컨테이너 후보를 앞에 둔다 — 운영에서 저장소 경로 탐색이 먼저 도는 것을 막는다.

⚠️ **`_load_dotenv` 는 후보가 없으면 조용히 리턴한다**(값이 주입으로 들어오므로 정상 동작이다).
**사전은 없으면 기동 실패여야 한다.** 없는 채로 뜨면 렌더 시점 앵커 해석에서 터지고 원인이 안
보인다. 선례를 그대로 베끼면 조용한 실패를 얻는다.

**로더를 `config.py` 에 두지 않는다.** 두 워커가 같은 이미지를 쓰지만 사전이 필요한 것은 편집
워커뿐인데, `config.py` 는 [analysis_worker.py:22](../../apps/ai-worker/src/analysis_worker.py#L22)
도 임포트한다 — 거기에 모듈 레벨 로드를 넣으면 **사전 하나 때문에 분석 워커까지 못 뜬다.**

사전을 소비하는 편집 파이프라인 모듈에 모듈 레벨로 둔다. `worker.py` 가 그 모듈을 임포트하므로
편집 워커는 기동 시점에 실패하고(의도), `analysis_worker.py` 는 `pipeline.video_analysis.*` 만
임포트하므로 영향을 받지 않는다.

### 3.5 TypeScript 쪽 — 빌드 설정 추가 0

[tsconfig.base.json:11](../../tsconfig.base.json#L11) 에 `resolveJsonModule: true` 가 이미 있고,
`rootDir: "src"` 안의 JSON 은 `dist` 로 방출된다. **설정이 0이라는 뜻이지 코드가 0이라는 뜻은
아니다** — 사전을 읽는 타입·상수 export 는 §3.6 대로 써야 한다.

### 3.6 커밋 1 에 포함되는 것

- `docker-compose.yml` — `ai-worker`·`analysis-worker` 두 서비스의 `build` 절
- `apps/ai-worker/Dockerfile` — COPY 경로 + 사전 한 줄
- `packages/shared-types/src/anchor-vocabulary.json` — 신규
- `packages/shared-types/src/` — 사전을 읽는 타입·상수 export
- `apps/ai-worker/src/` — 사전 로더(후보 목록 + fatal)
- 테스트 3종 (§7)

---

## 4. 커밋 2 — 스테이지별 `attempt`

```json
"seed": { "root": 1837462, "attempt": { "edit-director": 0, "style-director": 2 } }
```

- 스테이지 시드 = `sha256("{root}:{stage}:{attempt}")` 상위 8바이트. **함수를 문서에 이름으로 박는다.**
- 시스템 재렌더 · 만료 후 재생성 → `attempt` 유지 → 완전 동일
- 사용자 "다시 생성" → 해당 스테이지 `attempt++` → 다른 결과, 여전히 재현 가능

---

## 5. 커밋 3 — 무효화 규칙

A-2·A-5·B-6 를 흡수하는 중심 산출물이다.

**표가 아니라 데이터로 만들었다.** 문서의 표는 구현과 갈라지고, 갈라진 것을 아무도 모른다.
원본은 [`invalidation-vocabulary.json`](../../packages/shared-types/src/invalidation-vocabulary.json)
하나이며 TS(`invalidation.ts`)와 워커(`pipeline/invalidation.py`)가 같은 파일을 읽는다.
아래는 그 데이터의 요약이지 원본이 아니다.

### 레이어 상태는 셋이다

B-6 의 "재투영"이 세 번째 상태를 요구했다. 무효화/유지 두 가지로는 "컷 구성은 그대로인데
시각만 바뀐다"를 표현할 수 없다.

| 상태 | 뜻 |
|---|---|
| `invalidated` | 레이어를 다시 계산한다. 결과가 달라질 수 있다 |
| `retimed` | 구성은 그대로 두고 시각만 다시 투영한다. 컷 목록·스티커 종류는 바뀌지 않는다 |
| `preserved` | 손대지 않는다. 바이트 단위로 같아야 한다 |

### 액션 10건 × 레이어 9종

**모든 조합을 빠짐없이 적는다.** 생략을 허용하고 기본값을 두면, 레이어를 새로 추가했을 때
아무도 판단하지 않은 채 그 기본값으로 굳는다 — `preserved` 기본값은 새 레이어를 조용히 낡게
하고 `invalidated` 기본값은 조용히 낭비한다. 사전에 없는 조합은 예외다.

| 액션 | 무효화 / 재투영 / 유지 | attempt 증가 |
|---|---|---|
| 만료 후 재생성 | 0 / 0 / 9 | — |
| 사용자 "다시 생성" | 7 / 0 / 2 | music · edit · style |
| BGM 교체 (재투영 ≤ ±20%) | 2 / 5 / 2 | music |
| BGM 교체 (재투영 > ±20%) | 7 / 0 / 2 | music · edit · style |
| 스티커 팩 교체 | 2 / 0 / 7 | style |
| 전환 스타일 스왑 | 2 / 0 / 7 | edit |
| 컷 순서 수동 변경 | 2 / 3 / 4 | — |
| 컷 삭제 | 4 / 1 / 4 | — |
| 클립 추가 | 5 / 0 / 4 | edit · style |
| 출력 프로필·`fitMode` 변경 | 0 / 0 / 9 | — |

셀 단위 판단과 각 행의 근거는 사전의 `note` 에 있다.

### 표가 담고 있는 판단

- **첫 두 행은 레이어가 아니라 `attempt` 로 갈린다.** 둘 다 무효화 범위는 같아도 되는데,
  만료 재생성은 `attempt` 를 그대로 두어 산출물이 같고 사용자 재생성은 올려서 달라진다.
  인접 배치한 이유이며 `attempt` 열의 존재 이유다
- **"핀 승격"이 A-5 의 세 번째 축이다.** 더 나은 `analysisVersion` 이 나중에 생겼을 때 그것을
  쓸 것인가는 무효화도 재해석도 아니다. **사용자 재생성에서만 올린다** — 만료 재생성이 올리면
  "복원"이 다른 영상을 낸다
- **BGM 교체가 두 행인 이유는 가드다.** 시스템 재선곡은 번들 필터 안이라 거의 안 걸리지만
  사용자 주도 교체는 BPM 이 임의라 상시 걸린다. 후자는 edit-director 가 다시 돌아
  타임라인이 통째로 바뀌므로 **"곡만 바꿨는데 컷이 달라졌다"가 UI 에 드러나야 한다**
- **팩 교체는 재렌더가 아니라 재생성이다.** §1.2 의 "재렌더는 레지스트리·번들을 다시 조회하지
  않는다"는 **핀을 바꾸지 않는 재렌더**에만 적용된다. 팩 교체는 새 `packId` 를 핀하는 행위이고
  나머지 핀은 그대로 유지된다
- **수동 컷 편집은 어떤 `attempt` 도 올리지 않는다.** 사용자가 순서를 정했으므로 디렉터에
  선택이 없다
- **클립 추가가 기존 `analysis` 를 재사용한다.** A-5 로 분석을 스펙 밖 참조로 뺀 것의 실질
  이득이 여기서 나온다
- **마지막 행은 "해상도 변경"이 아니라 "출력 프로필·`fitMode` 변경 → 무효화 없음"이다.**
  `resolved.xy` 를 소스 정규화로 정의해서 원래보다 강한 주장이 됐다

---

## 6. 커밋 4 — 잔여 개정

- **editSpec 초안** — §1.1 의 A·B 잔여 전부. 여기에 더해 §7 의 `fallback` 예시에서
  **`prefer` 를 `ref` 로** 고친다(`[{ "kind": "freezone", "prefer": "topRight" }, …]`)
- **매니페스트 초안** — §1.2 의 C·D 전부 + anchor 사전을 별도 절로 분리. 여기에 더해 §3 의
  `defaultAnchor` 를 지우고(`anchorAffinity[0]` 이 기본값이다) 남은 `prefer` 를 `ref` 로 고친다

> `prefer` → `ref` 통일은 커밋 1 에서 사전에 이미 반영됐다. `freezone` 만 다른 필드 이름을 쓸
> 근거가 없고, 같은 것을 두 이름으로 부르면 어긋난다 — `defaultAnchor` 를 지운 것과 같은 논리다.
> **지금 두 초안과 사전이 갈라져 있으므로** 위 두 줄은 커밋 4 에서 반드시 닫는다.

- **두 초안의 "모든 좌표는 0~1" 원칙 문장** — 좌표계 진술이지 **범위 보장이 아니라는 것**을
  같은 문장에서 구분한다(§1.1). 구분이 없으면 다음 사람이 스키마 검증에 `0 <= x <= 1` 을 걸고
  클램프 금지 결정이 조용히 무너진다. 걸릴 자리가 둘이다 — 초안의 JSON Schema 예시와,
  v3 를 받게 될 API 의 스펙 검증(`parseEditSpec` 확장). **양쪽 다 `resolved.xy` 에 범위 제약을
  두지 않는다**고 적는다
- ~~**[trend-editing-pipeline.md](./trend-editing-pipeline.md) §3** — "레이어는 타임라인에 붙는다 /
  키프레임은 절대 시각(ms)" 문장을 B-7 결정에 맞춰 수정~~ **✅ 2026-08-20 완료** — trend 문서 §3이
  이미 `(cutId, offsetInCutMs)` 권위로 고쳐져 있다. 다시 고치지 말 것.
- **[api-spec.md](../api-spec.md)** — `EditJob` 응답에 `editSpec` 이 포함되므로 v3 확정 시 같은
  커밋에서 갱신한다(AGENTS.md 문서 갱신 의무)
- **[backlog.md](../backlog.md) A-7** — 이 검토가 답한 항목(스티커 팩 매니페스트 스키마,
  세이프 에어리어)을 정리하고, 아래 §8 을 추가한다

문서 개정판에 **"v3.1" 같은 번호를 붙이지 않는다.** 저장소에서 "v3" 가 이미 `pipelineVersion` ·
`editSpec.version` · 주석 세 곳을 가리킨다. `specVersion` 은 3 으로 고정하고 문서 개정은 상단
작성일 갱신으로 표시한다.

---

## 7. 검증

| 커밋 | 대상 | 방법 |
|---|---|---|
| 1 | 사전 정합성 | JSON 을 로드해 허용 `kind`/`ref` 조합을 대조하는 스키마 검증 테스트를 **TS·Python 양쪽에** 둔다. 사전이 바뀌었는데 한쪽이 안 따라오면 CI 에서 잡힌다 |
| 1 | 파생 공식 | 파이썬 픽스처 테스트 — 입력 키포인트 세트 → 기대 앵커 좌표를 저장소에 넣는다. `derivationVersion` 이 올라가면 픽스처도 함께 버전이 갈린다 |
| 1 | 빌드 | 두 워커 서비스가 루트 컨텍스트로 빌드되고, 이미지 안에 사전이 있으며, 사전을 지우면 **편집 워커만** 기동에 실패하는지(분석 워커는 떠야 한다 — §3.4) |
| 1 | 기존 회귀 | `npm test -w apps/api` 와 워커 테스트. 커밋 1 은 파이프라인 동작을 바꾸지 않으므로 기존 기대값이 그대로 통과해야 한다 |
| 2 | **시드 결정성** | 고정 `{root, stage, attempt}` 에 대한 스테이지 시드를 **골든 값**으로 박고, `PYTHONHASHSEED` 를 바꿔 두 번 돌려도 같은 값이 나오는지 확인한다. **파이썬 단독** — 스테이지 시드를 파생하는 것은 디렉터(워커)뿐이고 API 는 `attempt` 를 쓰기만 한다(§1.3 파생 공식과 같은 이유) |
| 3 | 무효화 규칙 | 액션 × 레이어 판단이 **하나도 빠지지 않았는지**(사전에 없는 조합은 예외), `attemptBump` 가 **스테이지 사전과 맞는지**(리더를 지목하면 워커가 그 스펙을 거부해 액션이 실행 불가가 된다), 그리고 계획이 약속한 행들이 실제로 그렇게 적혀 있는지. **만료 후 재생성은 시드가 하나도 안 바뀌는 것**까지 확인한다([storage-and-subscription-policy.md](../decisions/storage-and-subscription-policy.md) §3 의 약속) |

시드 결정성 테스트가 없으면 `PYTHONHASHSEED` 논거가 헛돈다 — 6개월 뒤 누군가 "이 sha256 은
과하다"며 되돌려도 CI 가 막지 못한다. 이 계획에서 **가장 조용히 깨질 수 있는 것이 재현성**이다.

⚠️ 골든 프레임·ffprobe 계약 테스트는 **CI 에 ffmpeg 설치**가 필요하고 현행 파이썬 테스트의
"ffmpeg 없이 돈다" 원칙을 바꾼다([progress.md](../progress.md)). 이 계획의 범위 밖이며 A-7 에 남아 있다.

---

## 8. 착수를 막는 것

미결은 [backlog.md](../backlog.md) A-7 에만 둔다. 이 검토로 **새로 열린 것**은 아래 하나이며,
**A-7 에 이미 추가돼 있다**(⚠️ 2026-08-20 신규 항목) — 중복 추가하지 말 것.

- **에셋 라이선스에 영구(perpetual) 조항을 필수로 걸 것인가** — §1.2 C-2 의 전제다. 구독형
  BGM 라이선스(Epidemic·Uppbeat 등)는 대개 "구독 기간 중 제작한 콘텐츠는 이후에도 사용 가능"
  구조인데, **만료 후 재렌더가 "기존 콘텐츠 사용"인지 "신규 제작"인지**가 계약서마다 다를 수 있다.
  법률 판단이 필요하고 스키마로는 풀리지 않는다. 조달 단계에서 **"신규 배포 중단 / 기존 저작물
  유지" 분리 조항**을 협상 항목으로 올린다.

이미 A-7 에 있는 것(번인 자막 전환 결정, BGM 조달, `bgm_tracks` 스키마, 디자이너 커미션,
세이프 에어리어 실측, CI ffmpeg)은 여기에 다시 적지 않는다.

**커밋 1~3 은 위 결정을 기다리지 않는다.** 어휘 사전·시드·무효화 표는 라이선스·조달과 독립이다.
