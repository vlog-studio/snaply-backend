# editSpec v3 — 스펙 · 에셋 매니페스트 · 어휘 사전의 확정 결정

**작성일**: 2026-08-20 (착수 계획 §1·§3~§6에서 분리 — 원문은 [archive/edit-spec-v3-kickoff.md](../archive/edit-spec-v3-kickoff.md))
**상태**: 결정 — 스펙 초안 검토(5회)에서 수렴했다. 공유 어휘 사전 3종(앵커 · 스테이지·시드 · 재생성
무효화)은 구현됐고, `editSpec` v3 와 에셋 매니페스트의 스키마 본문은 초안
([plans/edit-spec-v3.md](../plans/edit-spec-v3.md) · [plans/asset-pack-manifest.md](../plans/asset-pack-manifest.md))으로
있다 — 미결은 [backlog.md](../backlog.md) A-7 에만 둔다.
**원천**: v3 스펙·매니페스트가 따라야 할 설계 규칙과 그 근거. 어휘와 무효화 판단의 **값**은
`packages/shared-types/src/*-vocabulary.json` 이 원천이며, 이 문서는 그 이유만 담는다.
**관련 문서**: [plans/trend-editing-pipeline.md](../plans/trend-editing-pipeline.md)(상위 계획) ·
[specs/movie.md](../specs/movie.md) MOV-14·MOV-19 · [movie-cleanup-after-export.md](movie-cleanup-after-export.md) ·
[movie-export-policy.md](movie-export-policy.md) ⑤ · [snap-content-analysis.md](snap-content-analysis.md) ·
[movie-model.md](movie-model.md)

---

## 1. editSpec v3

| 항목 | 결정 | 근거 |
|---|---|---|
| A-1 | `version` 키 유지. `parseEditSpec` 폴백을 throw 로 | [edit-job.service.ts](../../apps/api/src/services/edit-job.service.ts) 의 `parseEditSpec` 이 알 수 없는 형태를 `{version:1, stylePreset:'일상'}` 으로 삼킨다 |
| A-1 | **큐 이름 분리** (`edit-v3`) | 아래 §4 |
| A-2 | `seed: { root, attempt: { <stage>: n } }`. 스테이지 시드 = `sha256("{root}:{stage}:{attempt}")` 상위 8바이트 | 전역 `attempt` 는 부분 재생성과 충돌한다. 해시를 이름으로 박지 않으면 파이썬 `hash()` 가 `PYTHONHASHSEED` 로 프로세스마다 달라져 재현성이 사라진다(§5) |
| A-3 | `grade` 레이어 신설 + `assetRefs` 에 `styleBundle`·`lutPack` | 현행 유일한 스타일 표현이 [editor.py](../../apps/ai-worker/src/pipeline/editor.py) `PRESETS` 의 `eq=` 한 줄이다. v3 초안에 갈 자리가 없었다 |
| A-4 | `intent.subtitles` 추가. **필수 필드이며 스펙 레벨 기본값을 두지 않는다** — 요청 바디의 값(`subtitles`, 무비는 `captions`, 기본 `false`)은 그대로 두고 API 가 스펙을 만들 때 값을 채운다 | 큐 페이로드에만 있어([edit-queue.ts](../../apps/api/src/queue/edit-queue.ts) `EditJobData.subtitles`) 레시피 재생성 시 자막 유무가 달라진다. 스펙에 기본값을 두면 A-1 의 "알 수 없는 형태는 실패" 원칙과 어긋난다 |
| A-5 | `analysis` 인라인 폐기 → `{ videoId, analysisVersion }` 참조 | `video_analyses` 테이블이 이미 있고 `@@unique([videoId, analysisVersion])` 로 행이 덮이지 않는다. 인라인은 [movie-recommendation.service.ts](../../apps/api/src/services/movie-recommendation.service.ts) 가 읽는 필드명과 갈라진다 |
| B-1 | **`output` 블록을 없앤다.** 기하(`width`·`height`·`fps`·`fitMode`)는 `renderSpec` 단독 권위 — editSpec 에 미러하지 않는다. 목표 길이는 `intent.targetDurationMs`, 실제 길이는 timeline 파생(B-2), `safeArea` 는 팩 참조(B-3) | `renderSpec` 이 이미 영구 저장되고 `profileVersion` 으로 검증된다([render_spec.py](../../apps/ai-worker/src/pipeline/render_spec.py) `parse_render_spec`). 미러를 두면 어느 쪽이 이기는지를 매번 물어야 한다. `resolved.xy` 가 소스 정규화라 디렉터는 캔버스 기하를 알 필요가 없다 |
| B-2 | `durationMs` 는 파생값 — 인제스트 단계에서 뺀다 | 타임라인 이전에 알 수 없다 |
| B-3 | `safeArea` → 매니페스트의 **7번째 팩 타입** | 불변 버전 + 계속 서빙 + 갱신 주기가 다른 팩과 같다. 스펙에 값으로 굽으면 이미 저장된 스펙을 못 고친다 |
| B-4 | `audio.bgm` 은 믹스 파라미터만. 트랙은 `music` 참조 | 작성자가 다른 두 스테이지가 같은 사실을 쓴다 |
| B-5 | `transitions[].sfxId` 제거 | 효과음은 style-director 도메인. `audio.sfx[].sourceRef` 로 역참조가 이미 된다 |
| B-6 | `beatLength` 권위, 길이는 파생. 재투영이 원래 길이 ±20% 를 벗어나면 edit-director 재실행 | 컷 길이를 음악 단위로 정했으므로 BPM 변화가 길이를 바꾸는 것이 옳다 |
| B-7 | 앵커는 `(cutId, offsetInCutMs)`, 지속은 `durationMs`. 절대 ms · `atBeat` 는 파생 | 시각 표현 3중을 정리한다. 클립 인덱스나 절대 ms 를 기준으로 두면 컷 하나가 바뀌거나 지워질 때 전부 어긋난다 — 안정된 `cutId` 가 기준이면 앵커 컷이 지워질 때만 드롭된다 |
| B-8 | `reason` 을 닫힌 코드 집합으로 (`{ code, detail }`) | 자유 문자열이면 `removedCutIds` → `reason` 집계가 문자열 파싱이 된다 |
| B-9 | `userEdits.locked` 대상을 열거형으로 | `"timeline.cuts.order"` 는 실재하지 않는 경로다 |
| B-10 | `source.clips[].uri` → `videoId` | 워커는 [worker.py](../../apps/ai-worker/src/worker.py) 에서 `db.fetch_source_keys` 로 키를 해석한다. URI 를 구우면 스토리지 이전 시 과거 스펙이 죽고 소유권 검증을 우회한다 |
| — | `resolved.xy` 는 **소스 정규화** | 앵커의 출처(얼굴·손·객체 bbox)가 전부 소스 좌표계다. 캔버스 정규화면 저장 시점에 fit 변환이 섞여 `fitMode` 종속이 된다 |
| — | **"0~1 정규화"는 좌표계 진술이지 범위 보장이 아니다.** `resolved.xy` 에 범위 제약을 걸지 않는다 — 스펙의 JSON Schema 에도, v3 를 받는 API 의 스펙 검증(`parseEditSpec` 확장)에도 | 파생은 프레임 밖 좌표를 클램프하지 않는다 — 프레임 위에 붙은 얼굴의 `aboveHead` 는 음수가 맞다. 클램프는 실패를 성공으로 위장하는 변환이라 폴백 체인이 "붙였다"고 판단한다. 배치 가능 여부는 세이프에어리어를 아는 **배치 단계**가 정하며, 그래야 파생이 `derivationVersion` 에만 매이고 세이프에어리어 팩 버전과 독립이다. 실제 값은 `apps/ai-worker/tests/fixtures/anchor-derivation.json` 의 경계 케이스에 있다(`chin` y=1.04, `beside` x=1.25) |

## 2. 에셋 매니페스트

| 항목 | 결정 | 근거 |
|---|---|---|
| C-1 | 서버 렌더용은 **TTF/OTF**. 폰트는 `ass` 필터의 `fontsdir=` 로 LRU 캐시 디렉터리를 직접 가리킨다. 이미지에는 두부 방지용 기본 한글 폰트 하나만 굽는다 | woff2 는 웹 전용이라 libass/fontconfig 가 인식하지 못한다. 팩 폰트는 런타임에 도착하므로 빌드 타임 `fc-cache` 로는 안 잡힌다 |
| C-2 | `expiresAt: null` 필수. **`retired` 를 법적 차단 전용으로 좁히고 라이선스 만료를 사유에서 뺀다** → 상태 셋(`experimental → active → deprecated`) | "신규 생성 제외 + 기존 스펙 서빙"은 초안의 `deprecated` 정의와 같다. 라이선스가 끝난 에셋도 기존 스펙에는 계속 서빙돼야 끝낸 무비를 다시 만들 수 있다(MOV-19). 이 결정은 에셋 계약에 "신규 배포 중단 / 기존 저작물 유지" 분리 조항을 확보하는 것을 전제로 한다 — 그 조항을 필수로 걸지는 미결이다([backlog.md](../backlog.md) A-7) |
| C-3 | 파생 공식 명시 + `derivationVersion`. **핀은 editSpec 의 `assetRefs` 옆** | MediaPipe Face Detection 6키포인트에 `cheekL`·`cheekR`·`chin` 이 없어 파생이 필요하다. `resolved` 가 "무효화 가능한 캐시"인 이상 재계산 가능성이 곧 재현성이다 |
| C-4 | **톤매핑 → LUT** 순서를 파이프라인 계약으로 못박는다 | BT.2020 PQ 소스에 rec709 LUT 를 먼저 태우면 색이 두 번 깨진다. 톤매핑은 정규화 단계([hdr.py](../../apps/ai-worker/src/pipeline/hdr.py))에 있다 |
| D-1 | `grain`·`vignette`·`halation` 을 LUT 아이템에서 분리 | `.cube` 는 `lut3d` 한 줄이고 halation 은 블러+블렌드 체인이다. 구현 비용이 다르다 |
| D-2 | `license` 는 아이템이 팩을 덮는다고 명시 | |
| D-3 | `attributionText`·`attributionUrl` 추가 | boolean 만으로는 무엇을 어디에 적을지 모른다 |
| D-4 | `minAppVersion` 을 클라이언트 전용으로 표시 | 워커는 앱 버전을 모른다 |
| D-5 | `triggerKinds` 가 전환 어휘의 상위집합임을 명시 (`"sticker"` 포함) | |
| D-6 | `moodTags` 어휘를 현행 `calm`·`upbeat`·`daily` 와 맞춘다 | [editor.py](../../apps/ai-worker/src/pipeline/editor.py) `PRESETS` 의 BGM 태그 |
| D-7 | `peakOffsetMs` 프리롤의 경계 클램프 규칙 | 첫 전환에서 타임라인 0 이전이 된다 |
| D-8 | `sfx.gainDb` 는 매니페스트가 기본값, 스펙이 오버라이드 | |
| — | **재렌더는 레지스트리·번들을 다시 조회하지 않는다. 스펙에 핀된 `packId`·`assetId` 만 해석한다** | `rollout`·`bgm.filter`·`sceneAffinity`·`transitionWeights` 가 전부 같은 함정이다. 규칙 하나가 필드별 주의보다 낫다 |

## 3. 어휘 사전

- **단일 원본 JSON** — `packages/shared-types/src/*-vocabulary.json`. 코드젠 없음, 수동 동기화 없음.
  지금 셋이다: `anchor`(앵커 어휘) · `stage`(스테이지·시드 알고리즘) · `invalidation`(재생성 규칙).
- **폴백 인코딩은 객체 배열로 통일.** `"face:aboveHead"` 문자열은 `offset` 을 담지 못해 확장 불가다.
- **자유 배치(`freezone`)도 `ref` 를 쓴다** — `prefer` 를 따로 두지 않는다. 같은 것을 두 이름으로
  부르면 어긋난다.
- **매니페스트의 `defaultAnchor` 를 지운다.** `anchorAffinity[0]` 이 곧 기본값이므로 두 값이 어긋날 여지를 없앤다.
- **파생 공식은 파이썬 단독 구현.** `resolved` 를 계산하는 것은 MediaPipe 출력을 가진 워커뿐이고
  API 는 저장·응답만 한다. 크로스랭귀지 골든 테스트는 필요 없고, **파이썬 픽스처 테스트**
  (입력 키포인트 → 기대 좌표)로 충분하다. 두 번째 구현은 앱(Swift/Kotlin)이 프리뷰 배치를 하기로
  할 때 오며, 그때 이 픽스처가 그대로 계약이 된다.
- **스펙 문서 개정에 "v3.1" 같은 번호를 붙이지 않는다.** 저장소에서 "v3" 가 이미 `pipelineVersion` ·
  `editSpec.version` · 주석 세 곳을 가리킨다. `specVersion` 은 3 으로 고정하고 문서 개정은 상단
  작성일 갱신으로 표시한다.

## 4. 구버전 워커가 v3 를 v2 로 렌더하지 않게 — 큐 분리(A-1)의 근거

호환 필드 이중 기록은 **실패하지 않기 때문에** 탈락이다.

- [edit_spec.py](../../apps/ai-worker/src/pipeline/edit_spec.py) 의 `parse_job_clips` 는 페이로드
  **최상위** `clips` 를 `editSpec` 보다 먼저 본다
- [worker.py](../../apps/ai-worker/src/worker.py) 는 `editSpec["stylePreset"]` 만 읽는다 —
  v3 에 그 키를 남기면 통과한다
- `renderSpec` 은 별도 인자라 무관하다

즉 구버전 워커는 v3 작업을 **v2 로 성공적으로 렌더한다.** 스티커·비트·LUT 가 빠진 결과물이 `done`
으로 완료되고, 환급은 실패·취소에만 있으므로([api-spec.md](../api-spec.md) §AI 편집) **100크레딧이
그대로 소모된다.**

유료 export 에서 조용한 품질 저하는 시끄러운 실패보다 나쁘다. 실패는 환급되고 재시도되지만,
저하된 성공은 사용자가 돈을 내고 열등한 결과를 받는다.

## 5. 스테이지 시드

```json
"seed": { "root": 1837462, "attempt": { "edit-director": 0, "style-director": 2 } }
```

- 스테이지 시드 = `sha256("{root}:{stage}:{attempt}")` 상위 8바이트. **함수를 이름으로 박는다.**
- 시스템 재렌더 · 만료 후 재생성 → `attempt` 유지 → 완전 동일
- 사용자 "다시 생성" → 해당 스테이지 `attempt++` → 다른 결과, 여전히 재현 가능
- 시드를 파생하는 것은 디렉터(워커)뿐이고 API 는 `attempt` 를 쓰기만 한다. 그래서 결정성은 **파이썬
  골든 값**으로 고정한다 — 고정 `{root, stage, attempt}` 의 시드를 박아 두고 `PYTHONHASHSEED` 를 바꿔도
  같은 값이 나와야 한다(`apps/ai-worker/tests/fixtures/stage-seed.json`). 이 테스트가 없으면 누군가
  "sha256 은 과하다"며 되돌려도 CI 가 막지 못한다 — 가장 조용히 깨질 수 있는 것이 재현성이다.

## 6. 재생성 무효화 규칙

원본은 [`invalidation-vocabulary.json`](../../packages/shared-types/src/invalidation-vocabulary.json) 하나이며
TS(`invalidation.ts`)와 워커(`pipeline/invalidation.py`)가 같은 파일을 읽는다. **판단을 문서의 표로 두지
않는다** — 문서의 표는 구현과 갈라지고, 갈라진 것을 아무도 모른다. 셀 단위 판단과 근거는 사전의 `note` 에 있다.

- **레이어 상태는 셋이다.** `invalidated`(다시 계산 — 결과가 달라질 수 있다) · `retimed`(구성은 그대로,
  시각만 다시 투영 — 컷 목록·스티커 종류는 바뀌지 않는다) · `preserved`(손대지 않음 — 바이트 단위로 같다).
  둘로는 B-6 의 재투영, 즉 "컷 구성은 그대로인데 시각만 바뀐다"를 표현할 수 없다.
- **모든 액션 × 레이어 조합을 빠짐없이 적는다.** 생략을 허용하고 기본값을 두면, 레이어를 새로 추가했을 때
  아무도 판단하지 않은 채 그 기본값으로 굳는다 — `preserved` 기본값은 새 레이어를 조용히 낡게 하고
  `invalidated` 기본값은 조용히 낭비한다. 사전에 없는 조합은 예외다.

사전이 담는 판단:

- **만료 후 재생성과 사용자 "다시 생성"은 레이어가 아니라 `attempt` 로 갈린다.** 만료 재생성은 `attempt` 를
  그대로 두어 산출물이 같고, 사용자 재생성은 올려서 달라진다.
- **"핀 승격"은 사용자 재생성에서만 한다.** 더 나은 `analysisVersion` 이 나중에 생겨도 만료 재생성은 올리지
  않는다 — 올리면 "복원"이 다른 영상을 낸다.
- **BGM 교체가 두 액션인 이유는 가드(재투영 ±20%)다.** 시스템 재선곡은 번들 필터 안이라 거의 안 걸리지만
  사용자 주도 교체는 BPM 이 임의라 상시 걸린다. 가드를 넘으면 edit-director 가 다시 돌아 타임라인이
  통째로 바뀌므로 **"곡만 바꿨는데 컷이 달라졌다"가 UI 에 드러나야 한다.**
- **팩 교체는 재렌더가 아니라 재생성이다.** §2 의 "재렌더는 레지스트리·번들을 다시 조회하지 않는다"는
  **핀을 바꾸지 않는 재렌더**에만 적용된다. 팩 교체는 새 `packId` 를 핀하는 행위이고 나머지 핀은 그대로다.
- **수동 컷 편집은 어떤 `attempt` 도 올리지 않는다.** 사용자가 순서를 정했으므로 디렉터에 선택이 없다.
- **클립 추가는 기존 `analysis` 를 재사용한다.** A-5 로 분석을 스펙 밖 참조로 뺀 것의 실질 이득이다.
- **출력 프로필·`fitMode` 변경은 무효화가 없다.** `resolved.xy` 를 소스 정규화로 정의했기 때문이다.

## 7. 사전의 배치와 로딩

- **워커 이미지는 저장소 루트를 빌드 컨텍스트로 쓴다**(API 와 같은 규약). 컨텍스트가 `apps/ai-worker` 면
  `packages/` 가 밖에 있어 사전이 이미지에 들어갈 수 없다. 편집·분석 워커가 같은 이미지를 쓰므로 둘 다 그렇다.
- **Dockerfile 은 사전만 좁게 복사한다**(`COPY . .` 로 넓히지 않는다 — 문서 한 줄만 고쳐도 이미지가
  재빌드된다). 사전 레이어를 `src/` 앞에 둬 워커 코드를 고칠 때 깨지지 않게 하고, `dist/` 가 아니라
  `src/` 의 원본 JSON 을 가져가 워커 이미지가 Node 빌드에 의존하지 않게 한다.
- **로더는 후보 목록(컨테이너 경로 → 저장소 경로)으로 찾고, 없으면 기동 실패다.** `.env` 로더처럼 조용히
  넘어가면 렌더 시점 앵커 해석에서 원인 없이 터진다.
- **로더를 `config.py` 에 두지 않는다.** 분석 워커도 `config.py` 를 임포트하므로, 편집 파이프라인만 쓰는
  사전 하나 때문에 분석 워커까지 못 뜬다.
- **편집 워커가 기동 시 확인할 사전은 [`pipeline/vocabulary.py`](../../apps/ai-worker/src/pipeline/vocabulary.py)
  의 `REQUIRED` 에 선언한다.** 디렉터리 스캔은 빠진 파일을 모른다. 선언 목록과 저장소의 실제 파일이 어긋나면
  워커 테스트가 잡는다.
- 이 배치는 원자적이다 — compose·Dockerfile·로더 중 하나만 되감으면 편집 워커가 뜨지 않으므로, 되돌릴 때는
  함께 되돌린다.
