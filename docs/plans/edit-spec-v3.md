# editSpec v3 — 스키마

**작성일**: 2026-08-20 · **상태**: 제안 (착수 전) — 현행 사실이 아니다.

착수 순서와 커밋 계획은 [edit-spec-v3-kickoff.md](./edit-spec-v3-kickoff.md),
상위 계획은 [trend-editing-pipeline.md](./trend-editing-pipeline.md),
미결은 [backlog.md](../backlog.md) A-7 에만 둔다.

관련: [asset-pack-manifest.md](./asset-pack-manifest.md) ·
[storage-and-subscription-policy.md](../decisions/storage-and-subscription-policy.md) §3

---

## 0. 범위

자동 편집 파이프라인의 6개 스테이지가 공유하는 단일 스펙의 필드 정의다.

**담지 않는 것**

- **어휘 값** — `anchor` 의 `kind`·`ref`, 무효화 상태와 조합, `attempt` 대상 스테이지,
  `reason.code`, `userEdits.locked`, `cuts[].role`, `transitions[].kind`, `accents[].kind` 값은
  `packages/shared-types/src/*-vocabulary.json` 이 원본이다. 이 문서는 값을 복제하지 않는다.
  ⚠️ 뒤 다섯(`reason.code` 이후)은 **아직 사전 파일이 없다.** 파일을 몇 개로 묶을지가 미결이며,
  그 전까지는 열린 문자열로 남는다 — `cuts[].role` 은 무효화 규칙이 근거로 삼고 있으므로
  가장 먼저 닫아야 한다(§11.1).
- **출력 기하** — 해상도·fps·`fitMode` 는 `renderSpec` 단독 권위다. §16 참조.
- **생성 시 파라미터** — 밀도·전환 가중치·보정 상한은 번들이 갖는다.
  [asset-pack-manifest.md](./asset-pack-manifest.md) §10.
- **미결 결정** — [backlog.md](../backlog.md) A-7.

---

## 1. 설계 원칙

1. **Append-only** — 각 스테이지는 자기 레이어에만 쓴다. 앞 스테이지 출력을 수정하지 않는다.
2. **의도와 결과 분리** — `anchor`(의도)와 `resolved`(계산 결과)를 나눈다. `resolved` 는
   언제든 버리고 다시 계산할 수 있는 캐시다.
3. **`intent` 는 사용자가 요청한 것, 나머지는 디렉터가 결정한 것.** 새 필드를 넣을 때
   "사용자가 이걸 요청했는가"로 판단한다. 요청이면 `intent`, 결정이면 해당 스테이지 레이어다.
4. **좌표는 소스 정규화** — `resolved.xy` 는 원본 클립 좌표계 기준 0~1 스케일이다.
   **범위가 0~1로 제한되지는 않는다.** §10.3 참조.
5. **파생은 클램프하지 않는다** — 기하 계산은 프레임 밖 값을 그대로 낸다. 배치 가능 여부는
   세이프에어리어를 아는 배치 단계가 정한다. §10.3 참조.
6. **시각 계산의 원천은 비트 그리드 배열이다** — `bpm` 이 아니다. §8.1 참조.
7. **에셋은 ID + 팩 버전 참조** — URL·수치를 굽지 않는다. 3개월 전 스펙도 재현된다.
8. **`reason` 은 닫힌 코드** — 자유 문자열이면 집계가 문자열 파싱이 된다. §9.5 참조.
9. **`userEdits` 는 최후 적용** — 재생성이 사용자 수정을 덮지 않는다.

---

## 2. 전체 구조

```json
{
  "version": 3,
  "projectId": "prj_01H...",
  "createdAt": "2026-08-20T09:12:00Z",

  "seed":       { },   // 인제스트
  "intent":     { },   // 인제스트 — 사용자 요청
  "assetRefs":  { },   // 인제스트 — 팩·버전 핀
  "source":     { },   // 인제스트
  "analysis":   { },   // 참조만 (인라인 아님)
  "music":      { },   // music-director
  "timeline":   { },   // edit-director
  "overlays":   { },   // style-director
  "grade":      { },   // style-director
  "audio":      { },   // style-director
  "userEdits":  { },   // 클라이언트 (P2)
  "provenance": { }    // 전 스테이지
}
```

**키 이름은 `version` 이다. `specVersion` 이 아니다.**
[edit-job.service.ts:64-88](../../apps/api/src/services/edit-job.service.ts#L64-L88) `parseEditSpec` 과
[worker.py:71-72](../../apps/ai-worker/src/worker.py#L71-L72) 가 v1·v2 를 그 키로 읽는다.
이름을 바꾸면 알 수 없는 형태가 `{version:1, stylePreset:'일상'}` 으로 조용히 삼켜진다(A-1).

---

## 3. seed — 재현성의 원천

```json
"seed": {
  "root": 1837462,
  "attempt": { "music-director": 1, "edit-director": 0, "style-director": 2 }
}
```

스테이지 시드 = `sha256("{root}:{stage}:{attempt}")` 의 **상위 8바이트를 빅엔디언으로** 읽은 값.

**해시 함수와 바이트 순서를 이름으로 박는다.** 파이썬 `hash()` 는 `PYTHONHASHSEED` 로
프로세스마다 값이 달라진다. 바이트 순서를 안 적으면 두 번째 구현이 리틀엔디언으로 읽어
완전히 다른 시드를 내고, 그건 조용히 다른 결과를 내는 실패다.
사전이 `seedByteOrder: "big"` 을 핀한다.

| 경로 | `attempt` | 결과 |
|---|---|---|
| 시스템 재렌더 · 만료 후 재생성 | 유지 | 완전 동일 |
| 사용자 "다시 생성" | 해당 스테이지만 `++` | 다른 결과, 여전히 재현 가능 |

`attempt` 를 전역 하나로 두면 부분 재생성이 깨진다 — 유지해야 할 스테이지의 시드까지 바뀐다.

**`attempt` 를 올리는 주체는 API(TS), 소비하는 주체는 워커(Python)다.** 어느 액션이 어느
스테이지의 `attempt` 를 올리는지는 무효화 사전이 갖는다(§15). 사전이 지목한 스테이지 이름이
워커의 `parse_seed` 가 아는 집합과 어긋나면 그 스펙은 거부된다 — 양쪽 테스트가 교차 검증한다.

---

## 4. intent — 사용자가 요청한 것

```json
"intent": {
  "subtitles": false,
  "targetDurationMs": 18000,
  "styleBundleId": "preset_daily"
}
```

`overlays.captions` 가 `[]` 인 것만으로는 **"자막을 요청하지 않았다"** 와 **"요청했는데 음성이
없었다"** 가 구분되지 않는다. 현행 기본값은 `subtitles: false`(whisper 비용 절약)이고 큐
페이로드에만 있어([edit-queue.ts:17](../../apps/api/src/queue/edit-queue.ts#L17)) 레시피 재생성 시
자막 유무가 달라진다(A-4).

`targetDurationMs` 는 **목표**다. 실제 길이는 `timeline` 에서 파생된다(B-2).

⚠️ **`styleBundleId` 에 버전이 없다.** `assetRefs.styleBundle` 의 `"preset_daily@3"` 과 중복이
아니라 **요청과 해석의 관계**다 — 사용자는 "일상"을 골랐지 `@3` 을 고르지 않았고, 재생성 시
번들이 `@4` 로 올라도 사용자의 선택은 그대로다. 원칙 3 이 그대로 적용된 자리다.

📌 v2 의 `stylePreset`(`'감성'|'여행'|'일상'`, `shared-types` 의 `StylePreset` 타입)과는 다른
필드다. 같은 이름에 다른 값 공간을 주면 타입 이름과 필드 이름이 어긋나므로 이름을 나눴다.

⚠️ **`subtitles` 는 필수 필드다.** 없는 스펙을 만나면 기본값을 채우지 않고 거부한다 — A-1 과
같은 원칙이다. v3 생성 경로가 항상 값을 채운다.

📌 `intent` 변경(예: 자막 켜기)은 아직 무효화 사전의 액션에 없다. `overlays.captions` 무효화에
더해 **whisper 재실행**이 필요한데, whisper 는 스테이지가 아니라 분석 리더라 `attempt` 축에
들어가지 않는다. 축이 하나 더 필요할 수 있으므로 구현 시점에 판단한다.

---

## 5. assetRefs — 버전 핀

```json
"assetRefs": {
  "styleBundle": "preset_daily@3",
  "stickerPack": "sticker@2026-08-scribble-a",
  "lutPack": "lut@2026-08",
  "sfxPack": "sfx@2026-07",
  "bgmPack": "bgm@2026-08",
  "fontPack": "font@1",
  "safeAreaPack": "safearea@2026-08",
  "derivationVersion": 1,
  "gradeMappingVersion": 1
}
```

`styleBundle` 은 나머지 팩을 묶은 프리셋이지만, **번들도 버전이 오르므로 해석된 결과를 함께
스냅샷한다.** 번들만 핀하면 번들이 갱신될 때 과거 스펙이 다른 팩을 가리킨다.
버전 없는 사용자 선택은 `intent.styleBundleId` 가 갖는다(§4).

`derivationVersion` 은 **앵커 파생 공식 전용**이다. `resolved` 가 재계산 가능한 캐시인 이상
재계산 가능성이 곧 재현성이므로 `beatGridVersion`·`analysisVersion` 과 같은 부류다(C-3).

`gradeMappingVersion` 은 **`tempShift`·`tintShift` → `colorbalance` 축 매핑 함수의 버전**이다.
저장값이 `-0.04` 하나뿐이므로 매핑이 바뀌면 같은 스펙이 다른 색으로 렌더된다 — 재현성
위반이다. §11.2 참조.

⚠️ **보정 상한은 여기 없다.** `grade.match` 는 결과가 저장되고 재계산되지 않으므로 버전 핀이
아니라 생성 시 파라미터다. 번들이 갖는다(§11.3).

**재렌더는 레지스트리·번들을 다시 조회하지 않는다.** 여기 핀된 `packId` 만 해석한다.
`rollout`·`bgm.filter`·`sceneAffinity`·`transitionWeights`·`density`·`correction` 같은 쿼리형·생성 시
필드는 **신규 생성 경로에서만** 평가된다.

---

## 6. source — 원본 클립

```json
"source": {
  "clips": [
    { "clipId": "c1", "videoId": "vid_01H...", "durationMs": 4200, "hasAudio": true }
  ]
}
```

**`videoId` 다. S3 URI 가 아니다.** 워커는
[worker.py:86](../../apps/ai-worker/src/worker.py#L86) `fetch_source_keys(user_id, video_ids)` 로 키를
해석한다. URI 를 구우면 스토리지 이전 시 과거 스펙이 전부 죽고, 소유권 검증도 우회된다(B-10).

`durationMs` 는 §9.3 의 컷별 제약 검사에 쓰인다.

해상도·fps 는 여기 두지 않는다 — `video_analyses` 와 `renderSpec` 이 각각 갖는다.

---

## 7. analysis — 참조만

```json
"analysis": {
  "clips": {
    "c1": { "analysisVersion": 1 }
  }
}
```

키가 `clipId` 이고 `clipId → videoId` 는 §6 이 갖는다. **`videoId` 를 여기 다시 두지 않는다** —
두 곳에 있으면 갈라진다.

**인라인하지 않는다.** `video_analyses` 테이블이 이미 있고
`@@unique([videoId, analysisVersion])` 로 행이 덮이지 않으므로 참조 핀이 안전하게 작동한다(A-5).

인라인하면 두 가지가 깨진다.

- 의미 필드 이름이 기존 계약과 갈라진다. `summary`·`moods`·`topics`·`places`·`objects`·
  `actions`·`visualQuality` 를 [movie-recommendation.service.ts:262-297](../../apps/api/src/services/movie-recommendation.service.ts#L262-L297)
  이 읽는다 — 이름을 바꾸면 배포된 템플릿 추천이 깨진다
- 클립 10개에 수십 KB 가 붙어 storage 원가표가 틀린다

**편집 전용 산출물**(`highlightMs`·`stickerHints`·`faces`·`hands`)은 `video_analyses` 에 컬럼을
더하거나 별도 테이블로 간다. 스펙에는 들어오지 않는다.

**핀 승격은 정책이다.** 더 나은 `analysisVersion` 이 나중에 생겼을 때 핀을 올릴지는 무효화도
재해석도 아닌 별개 축이고, 그 경계가 `attempt` 경계와 정확히 일치한다(§15).

---

## 8. music — music-director

```json
"music": {
  "trackId": "bgm_lofi_014",
  "bpm": 92,
  "startOffsetMs": 0,
  "beatGridMs": [0, 652, 1304, 1957, 2609, 3261, 3913, 4565, 5217],
  "beatGridVersion": 1,
  "downbeatIdx": [0, 4, 8],
  "sections": [
    { "name": "intro", "startBeat": 0, "endBeat": 4 },
    { "name": "build", "startBeat": 4, "endBeat": 8 }
  ],
  "reason": { "code": "MOOD_MAJORITY", "detail": { "mood": "calm", "fit": "duration" } }
}
```

### 8.1 시각 계산의 원천은 `beatGridMs` 배열이다

⚠️ **`bpm` 은 표시·필터용이며 시각 계산에 쓰지 않는다.**

위 그리드의 간격은 652, 652, 653, 652 다. 92 BPM 은 652.17ms 라 정수 그리드에서 반올림이
갈린다. `bpm` 으로 되돌아가 계산하면 이렇게 된다.

```
균일 가정 (bpm)   2비트                 = 1304.3ms
그리드 인덱싱     startBeat=0, 2비트    = 1304ms
그리드 인덱싱     startBeat=2, 2비트    = 1305ms   ← 같은 beatLength 인데 다르다
```

**그리드를 스냅샷하는 이유가 정확히 이것이므로, 공식이 `bpm` 을 쓰면 스냅샷이 무의미해진다.**

부수 이득: 그리드 인덱싱은 정수 연산이라 재계산이 정확히 일치한다. 파생값 검증에 오차
허용이 필요 없다(§9.2).

### 8.2 그리드 스냅샷

`beatGridMs` 는 **사용 구간만 잘라** 스냅샷한다. 18초 영상에 3분 트랙의 비트 276개를 넣을
이유가 없다. 모든 컷의 `startBeat + beatLength` 최댓값까지는 반드시 포함한다.

⚠️ **`sections` 와 `downbeatIdx` 도 함께 자르고, 인덱스를 잘린 그리드 기준으로 리베이스한다.**
그래야 `beatGridMs[section.startBeat]` 가 그대로 유효하다. 원본 인덱스를 유지하면 `sections`
만 다른 기준을 쓰게 되고, 범위 밖 인덱스가 스펙에 남는다.

리베이스 결과 어떤 섹션이 통째로 잘려 나가면 그 섹션은 스냅샷에서 제외한다 — 영상이 쓰지
않는 구간이다.

**렌더러가 읽는 것은 이 스냅샷이다.** `bgm_tracks` 의 `beat_grid_version` 컬럼은 감사·디버깅용이며
렌더 경로가 읽지 않는다. 명시하지 않으면 누군가 "최신 그리드를 쓰는 게 낫지 않나" 하고
컬럼을 다시 읽는다.

트랙 정보는 여기에만 있다. `audio.bgm` 은 믹스 파라미터만 갖는다(B-4).

---

## 9. timeline — edit-director

### 9.1 cuts

```json
"cuts": [
  {
    "cutId": "t1",
    "clipId": "c3",
    "sourceInMs": 900,
    "sourceOutMs": 2204,
    "startBeat": 0,
    "beatLength": 2,
    "speed": 1.0,
    "role": "hook",
    "reason": { "code": "HIGH_ENERGY_CLOSEUP", "detail": { "energy": 0.82 } }
  }
]
```

### 9.2 권위와 파생 — 네 값 중 셋만 독립이다

`sourceInMs` · `sourceOutMs` · `speed` · `beatLength` 는 서로를 결정한다. 권위를 정하지 않으면
과결정 상태로 남는다(B-7 이 오버레이에서 정리한 것과 같은 문제다).

**`sourceOutMs` 가 파생이다.**

```
sourceOutMs = sourceInMs + (beatGridMs[startBeat + beatLength] - beatGridMs[startBeat]) × speed
```

`speed` 를 파생으로 두지 않는 이유: `speed` 는 **연출 의도**이고 범위가 좁다(대략 0.5~2.0).
파생시키면 4.2초 클립에서 2비트를 뽑는데 발화 구간이 3초일 때 `speed` 가 2.3 이 나온다 —
목소리가 다람쥐가 되고, 사후 클램프도 못 한다(클램프하면 길이가 안 맞는다).
소스 구간은 원본 길이에 종속되는 물리 제약이므로 그쪽이 밀리는 것이 맞다.

**파생값이지만 스냅샷으로 기록한다.** 매번 재계산하면 소비처마다 어긋날 여지가 생긴다.
그리드 인덱싱은 정수 연산이므로 **오차 허용 없이 완전 일치**로 검증하고, 어긋나면 실패시킨다.

### 9.3 컷별 제약과 재투영

모든 컷이 만족해야 한다.

```
sourceInMs + (beatGridMs[startBeat + beatLength] - beatGridMs[startBeat]) × speed  ≤  clip.durationMs
```

⚠️ **재투영 시 이 제약을 컷마다 다시 검사한다. 하나라도 깨지면 재투영을 포기하고
edit-director 를 다시 돌린다.**

`sourceOutMs` 가 파생이므로 BPM 이 낮아지면 소스 창이 커진다. 그러면 안 보이던 프레임이
들어오는데, 그건 `retimed` 의 정의("구성은 그대로, 시각만")를 위반한다. 총 길이만 보는
±20% 가드는 이걸 못 잡는다.

⚠️ **총 길이 가드**: 재투영한 총 길이가 원래의 ±20% 를 벗어나면 마찬가지로 edit-director 를
다시 돌린다(B-6). 92→128 BPM 이면 28% 짧아지는데, 그 정도면 컷 구성을 다시 짜는 것이 맞다.

두 가드는 같은 탈출구를 쓴다.

가드에 걸리는 빈도가 경로마다 다르다 — 시스템 재선곡은 번들 필터 안이라 BPM 폭이 좁지만,
**사용자 주도 교체는 BPM 이 임의라 가드가 상시 걸린다.** 이때 "곡만 바꿨는데 컷이 달라졌다"가
UI 에 드러나야 한다.

### 9.4 transitions

```json
"transitions": [
  {
    "transitionId": "x1",
    "fromCutId": "t1",
    "toCutId": "t2",
    "kind": "whip",
    "durationMs": 180,
    "params": { "direction": "left" },
    "reason": { "code": "MOTION_DIRECTION_MATCH", "detail": { "direction": "left" } }
  }
]
```

**`sfxId` 는 여기 없다.** 효과음은 style-director 도메인이고 `audio.sfx[].sourceRef` 로 역참조가
이미 된다(B-5).

`atBeat` 도 없다 — `toCutId` 의 `startBeat` 에서 파생된다.

`kind` 는 닫힌 집합이다. 매니페스트의 `triggerKinds`(§7.1)와 번들의 `transitionWeights`(§10)가
같은 어휘를 참조하므로, **집합은 사전이고 가중치는 번들이다** — `bgm.filter.moodTags` 와 같은
구조다. 사전 파일은 아직 없다(§0).

### 9.5 reason 코드

`reason` 은 `{ code, detail }` 이다. `code` 는 닫힌 집합이고 사전이 원본이다.

자유 문자열이면 `userEdits.removedCutIds` → `reason` 집계가 문자열 파싱이 되고,
"어떤 규칙이 자주 틀리는지 드러난다"는 §13 의 주장이 성립하지 않는다(B-8).

### 9.6 excluded

```json
"excluded": [
  { "clipId": "c5", "reason": { "code": "QUALITY_BELOW_THRESHOLD", "detail": { "score": 0.21 } } }
]
```

"왜 그 클립이 빠졌지?"에 답할 수 있고, P2 에서 "다시 넣기"를 제공할 수 있다.

**무효화 사전에서는 `timeline.cuts` 레이어에 속한다.** 별개 레이어로 두지 않는 이유는 같은
스테이지가 같은 시점에 쓰기 때문이다 — 컷 목록이 다시 계산되면 무엇이 빠졌는지도 함께
다시 정해진다. `grade.accents` 와 대비되는 자리다(§11.1).

---

## 10. overlays — style-director

### 10.1 stickers

```json
"stickers": [
  {
    "stickerId": "s1",
    "assetId": "scribble_heart_01",
    "anchorCutId": "t2",
    "offsetInCutMs": 200,
    "durationMs": 1400,

    "anchor": { "kind": "face", "ref": "aboveHead", "offset": [0, -0.45] },
    "fallback": [
      { "kind": "freezone", "ref": "topRight" },
      { "kind": "drop" }
    ],
    "resolved": { "xy": [0.46, -0.03], "scale": 0.22, "rotation": -6.2, "source": "face", "conf": 0.94 },

    "scaleRef": "faceWidth",
    "motion": { "in": "popOvershoot", "out": "scaleFade" },
    "reason": { "code": "SEMANTIC_HINT", "detail": { "concept": "heart" } }
  }
]
```

### 10.2 시각 표현 — 앵커 컷 + 지속시간

**`(anchorCutId, offsetInCutMs)` 가 권위, `durationMs` 가 지속, 절대 ms 와 `atBeat` 는 파생이다**(B-7).

`durationMs` 로 지속을 표현하므로 **스티커가 다음 컷으로 자연스럽게 넘어간다.**
[trend-editing-pipeline.md](./trend-editing-pipeline.md) §3 의 "레이어는 클립이 아니라 타임라인에
붙는다 / 스티커가 컷을 가로질러 살아남아야 한다"가 그대로 지켜진다.

같은 §3 의 "키프레임은 절대 시각(ms)" 문장은 이 결정에 맞춰 수정됐다 — **절대 ms 도 컷이
삭제되면 같이 어긋나므로** 원안의 문제의식은 맞지만 해법이 불충분했다.

앵커 컷이 삭제되면 스티커도 함께 드롭된다. 세 표현이 갈라질 여지가 없다.

### 10.3 resolved — 소스 정규화, 범위 무제약

**좌표계는 소스 정규화다.** 앵커의 출처(얼굴·손·객체 bbox)가 전부 소스 좌표계이므로,
캔버스 정규화로 저장하면 저장 시점에 fit 변환이 섞여 `fitMode` 종속이 된다. 소스 정규화로
두면 렌더가 fit 변환을 담당하고 `resolved` 는 출력 프로필 변경에도 살아남는다.

⚠️ **원칙 4의 "0~1"은 좌표계 기준이지 범위 보장이 아니다.** 파생은 클램프하지 않으므로
`resolved.xy` 는 음수나 1 초과가 될 수 있다.

| 입력 | 결과 |
|---|---|
| 프레임 상단에 붙은 얼굴 | `aboveHead` y = −0.034 |
| 턱이 잘린 얼굴 | `chin` y = 1.04 |
| 폭을 가득 채운 객체 | `beside` x = 1.25 |

**검증 코드가 `0 <= x <= 1` 을 걸면 이 설계가 무너진다.**

클램프하지 않는 이유: 프레임 안으로 당기면 스티커가 조용히 다른 자리에 붙고 폴백 체인은
"성공했다"고 판단한다. 배치 가능 여부는 세이프에어리어를 아는 배치 단계가 정한다.
파생은 기하 계산이고 배치는 정책 판단이다.

### 10.4 fallback

객체 배열이며 **`drop` 으로 끝나야 한다.** `isValidFallbackChain()` 이 검증한다.

매니페스트의 `anchorAffinity` 는 규칙이 정반대다 — `drop` 을 포함하면 안 된다.
`isValidAnchorAffinity()` 가 별도로 검증한다. 같은 배열이 한쪽에서 통과하고 다른 쪽에서
거부되는 것을 양쪽 테스트가 고정한다.

`kind`·`ref` 어휘와 `offset` 의미는 `anchor-vocabulary.json` 이 원본이다.

### 10.5 captions

```json
"captions": [
  {
    "captionId": "cap1",
    "anchorCutId": "t2",
    "offsetInCutMs": 120,
    "durationMs": 1180,
    "text": "오늘은 카페 왔어요",
    "words": [ { "t": "오늘은", "startMs": 0, "endMs": 360 } ],
    "style": "badgeOutline",
    "anchor": { "kind": "safeArea", "ref": "lowerThird" }
  }
]
```

`words[].startMs` 는 캡션 시작 기준 상대값이다.

---

## 11. grade — style-director

```json
"grade": {
  "look": {
    "lutAssetId": "neutral_crisp_01",
    "intensity": 0.7,
    "grain": 0.05,
    "vignette": 0.0,
    "halation": 0.0
  },
  "match": {
    "referenceClipId": "c3",
    "perClip": {
      "c1": {
        "corrections": { "exposure": 0.06, "tempShift": -0.04, "tintShift": 0.01, "saturation": 1.02 },
        "clamped": false,
        "reason": { "code": "UNDEREXPOSED_VS_REF", "detail": { "delta": 0.06 } }
      },
      "c5": {
        "corrections": { "exposure": 0.15, "tempShift": 0.0, "tintShift": 0.0, "saturation": 1.0 },
        "clamped": true,
        "reason": { "code": "EXCEEDS_CORRECTION_LIMIT", "detail": {} }
      }
    }
  },
  "accents": [
    { "anchorCutId": "t1", "offsetInCutMs": 0, "durationMs": 500,
      "kind": "hookBoost", "reason": { "code": "ROLE_HOOK", "detail": {} } }
  ]
}
```

현행 유일한 스타일 표현은 [editor.py:34-38](../../apps/ai-worker/src/pipeline/editor.py#L34-L38) 의
`eq=saturation=0.8` 한 줄이다. v3 초안에는 갈 자리가 없었다(A-3).

### 11.1 `grade` 세 갈래는 축이 각각 다르다 — 별개 레이어다

| 하위 | 단위 | 컷 삭제·순서에 반응하는가 | 나오는 곳 |
|---|---|---|---|
| `look` | 영상 전체 하나 | 아니오 | 번들 |
| `match` | 클립 | 아니오 (레퍼런스 재선정 제외) | 클립 색 통계 |
| `accents` | **컷** | **예** | `role` · `music.sections` |

⚠️ **셋은 무효화 사전에서 별개 레이어다.** `grade.` 라는 공통 접두사 때문에 하나로 읽히기
쉬운데, `accents` 만 `anchorCutId` 로 컷에 매인다. 한 레이어로 두면 컷을 지웠을 때 없는 컷을
가리키는 액센트가 스펙에 남는다.

사전의 `layerNotes` 가 이 차이를 데이터로 갖는다 — 오분류가 이름에서 왔으므로 이름 옆에
경고를 둔다. `layerNotes` 가 비면 테스트가 실패한다.

**`look` 과 `match` 를 나눈 이유**: 프리셋 스왑이 매칭 재계산 없이 끝나려면 따로 무효화될 수
있어야 한다. **`match` 는 컷마다 다르고 `look` 은 영상 전체 하나다** — 컷마다 다른 룩을 걸면
하나의 영상이 아니라 클립 모음으로 읽힌다.

**`accents` 가 `retimed` 로 표현되지 않는 경우**: BGM 교체 시 오버레이는 `retimed` 지만
`accents` 는 `invalidated` 다. 액센트가 `music.sections` 에서 나오므로 곡이 바뀌면 무엇을
강조할지 자체가 바뀐다. 컷 순서 변경도 마찬가지다 — 어느 컷이 hook 인지가 바뀐다.

⚠️ **그래서 `cuts[].role` 이 닫힌 집합이어야 한다.** 무효화 규칙이 "순서가 바뀌면 어느 컷이
hook 인지가 바뀐다"를 근거로 삼는데, `role` 이 열린 문자열이면 그 논리에 계약이 없다.
사전 파일이 아직 없으므로 **가장 먼저 닫아야 하는 어휘다**(§0).

⚠️ **클립 추가는 `match` 를 무효화한다.** 추가된 클립의 `perClip` 항목이 없다는 이유만이 아니다 —
추가 클립이 기존 레퍼런스보다 노출·품질이 좋으면 `referenceClipId` 가 바뀌고, 그러면
**모든 클립의 보정량이 실제로 달라진다.** 유지하면 낡은 레퍼런스 기준 보정이 남는다.

### 11.2 perClip 의 단위 — 정규화 게인

| 필드 | 필터 | 중립값 | 단위 |
|---|---|---|---|
| `exposure` | `eq=brightness` | 0.0 | 가산 |
| `saturation` | `eq=saturation` | 1.0 | **배수** |
| `tempShift` · `tintShift` | `colorbalance` | 0 | 가산, −1~1 정규화 게인 |

⚠️ **`tempShift` 는 켈빈이 아니다.** 이름에 `Shift` 를 붙인 이유가 그것이다.
`colortemperature` 필터는 절대 온도를 받지 델타를 받지 않으므로 "−80K 이동"을 직접 표현할 수
없고, 켈빈으로 가려면 소스 색온도 추정이 새 작업으로 붙는다. `grade.match` 의 목적은 절대
색온도를 맞추는 것이 아니라 **클립 간 차이를 줄이는 것**이므로 상대 게인으로 충분하다.

`match` 의 계산 방식과도 맞는다 — 레퍼런스 대비 RGB 채널 평균 차이에서 보정량을 뽑으면
자연스럽게 정규화 게인이 나온다. 켈빈이면 역산이 한 번 더 붙는다.

`tempShift`·`tintShift` → `colorbalance` 세 축(시안-레드 / 마젠타-그린 / 옐로-블루) 매핑은
**파이썬 단독 구현**이다. 세 축을 스펙에 노출하면 `perClip` 이 장황해지고 디렉터가 세 값을
독립적으로 정할 이유도 없다.

⚠️ **매핑 함수는 `assetRefs.gradeMappingVersion` 으로 핀된다.** 저장값이 `-0.04` 하나뿐이므로
매핑이 바뀌면 같은 스펙이 다른 색으로 렌더된다. `derivationVersion` 과 같은 부류다.

**`saturation` 만 배수인 것은 의도다.** `eq=saturation=` 이 배수를 받으므로, 저장값이 필터로
그대로 들어가는 성질이 유지된다.

### 11.3 보정 상한은 번들이 갖는다

`clamped: true` 는 보정량이 상한을 넘어 부분 보정만 했다는 뜻이다. 어두운 클립을 억지로
끌어올리면 노이즈만 증폭된다.

판정식은 네 필드에 공통이다.

```
|value − neutral| ≤ max
```

⚠️ **상한값은 스펙에도 사전에도 없다.** `grade.match` 는 결과가 저장되고 재계산되지 않으므로
버전 핀이 아니라 **생성 시 파라미터**다. 프리셋마다 달라야 하는 값(감성은 공격적, 일상은
보수적)이므로 `density` 와 같은 자리 — 번들의 `correction` 블록이다.
[asset-pack-manifest.md](./asset-pack-manifest.md) §10.1.

번들은 `assetRefs` 에 핀되므로 재현성은 이미 확보된다.

**`correction` 의 키는 `perClip[*].corrections` 의 필드명과 동일하다.** 이름을 붙여 대응시키면
대응이 관례로 남지만, 키가 같으면 기계가 검사한다.

```
Object.keys(bundle.correction) === Object.keys(perClip[c].corrections)
```

⚠️ **`corrections` 는 네 필드를 항상 기록한다** — 중립값이어도 생략하지 않는다. 위 검사가
키 집합의 **완전 일치**라 하나라도 빠지면 실패한다. 예시의 `c5` 가 `tempShift: 0.0` 을
명시하는 이유다.

⚠️ **보정값을 `corrections` 하위로 묶은 이유가 이것이다.** `clamped`·`reason` 과 같은 층에 두면
집합이 달라져 위 검사가 항상 실패한다. 부수 이득으로 보정값과 메타데이터가 구조로 분리되어,
나중에 필드가 늘어도 어디 넣을지 명확하다.

매니페스트 스키마가 저장소에 들어오는 시점에 이 한 줄로 닫힌다.

### 11.4 필터 체인 순서 — 파이프라인 계약

```
클립별:  정규화 → 톤매핑 → match(eq, colorbalance) → [컷·전환]
전체:    → look(lut3d) → accents → grain/vignette → 오버레이
```

- **톤매핑이 LUT 앞이다.** 아이폰 기본 촬영은 BT.2020 PQ 다. 톤매핑 없이 rec709 LUT 를
  태우면 색이 두 번 깨진다. 현행 파이프라인에 톤매핑이 없으므로 신규 구현이다(C-4).
- **LUT 는 정규화된 입력에만 닿는다.** match 이전에 걸면 클립마다 다른 입력에 같은 룩업이
  적용돼 결과가 제각각이 된다.
- LUT 를 concat 이후 한 번만 걸면 N 회가 아니라 1 회 연산이고, 전환 블렌딩이 LUT 이전
  공간에서 일어나 더 자연스럽다.

---

## 12. audio — style-director

```json
"audio": {
  "bgm": { "gainDb": -14, "fadeInMs": 500, "fadeOutMs": 2000 },
  "sfx": [
    { "sfxId": "whoosh_02", "sourceRef": "x1", "gainDb": -12 },
    { "sfxId": "pop_01", "sourceRef": "s1" }
  ],
  "mix": {
    "targetLufs": -14,
    "truePeakDb": -1.5,
    "ducking": { "enabled": true, "sidechain": "sourceAudio", "ratio": 4,
                 "thresholdDb": -24, "attackMs": 20, "releaseMs": 300 }
  }
}
```

**`bgm` 에 `trackId`·`startOffsetMs` 가 없다.** `music` 이 갖는다(B-4).

**`sfx` 에 `atMs` 가 없다.** `sourceRef` 가 가리키는 전환·스티커에서 파생되며, 매니페스트의
`peakOffsetMs` 만큼 프리롤이 적용된다. 프리롤이 타임라인 0 이전이 되면 클램프한다.

`gainDb` 는 선택 필드다. 없으면 매니페스트의 기본값을 쓴다(D-8).

⚠️ **`sidechain` 은 `"sourceAudio"` 다.** concat 된 원본 오디오 트랙을 그대로 물린다.
음성만 분리해 물리려면 소스 분리(demucs 계열)가 필요한데 안전 목록에 없고, 워커 이미지가
이미 1.38GB 다. 브이로그 원본은 대부분 발화가 주 성분이라 분리 없이도 덕킹이 의도대로
작동한다. 음성 분리를 도입하려면 A-7 의 새 항목이다.

---

## 13. userEdits — 클라이언트 (P2)

```json
"userEdits": {
  "removedCutIds": ["t5"],
  "removedStickerIds": ["s3"],
  "pinnedCutOrder": ["t1", "t3", "t2"],
  "locked": ["CUT_ORDER"],
  "editedAt": "2026-08-20T09:30:00Z"
}
```

**재생성 시 항상 마지막에 적용한다.** `locked` 에 든 대상은 재생성에서 제외된다 —
P2 의 순서 잠금 모드가 이 필드로 구현된다.

`locked` 는 **열거형**이다. `"timeline.cuts.order"` 같은 자유 문자열 경로는 `order` 가 실재하는
필드가 아니고, 소비자마다 다르게 파싱한다(B-9). 값 집합은 사전이 원본이다.

이 레이어는 학습 데이터다. `removedCutIds` 에 해당하는 컷의 `reason.code` 를 집계하면 어떤
규칙이 자주 틀리는지 드러난다. 같은 방식으로 `removedStickerIds` 의 `assetId` 별 삭제율이
팩 은퇴 판단 근거가 된다.

---

## 14. provenance

```json
"provenance": {
  "stages": [
    { "stage": "music-director", "version": 1, "ranAt": "...", "status": "ok", "durationMs": 40 },
    { "stage": "edit-director",  "version": 2, "ranAt": "...", "status": "ok", "durationMs": 120 }
  ]
}
```

`version` 은 규칙 엔진 버전이다. v2 를 배포한 뒤에도 "이 영상은 구 규칙으로 만들어졌다"를
알 수 있다.

---

## 15. 무효화

### 15.1 원본은 JSON 이다

무효화 규칙은 **구현이 실행 시점에 참조하는 계약**이지 사람이 읽는 설명이 아니다.
문서에 표로 두면 구현과 갈라지고, 갈라진 것을 아무도 모른다.

원본: `packages/shared-types/src/invalidation-vocabulary.json`
소비: TS(API) · Python(워커) 양쪽 + 교차 검증 테스트

**이 문서는 조합·상태 정의·액션 목록을 복제하지 않는다.** 정의는 데이터고, 아래는 논증이다.

### 15.2 왜 상태가 셋인가

둘로는 **"구성은 그대로인데 시각만 바뀐다"** 를 표현할 수 없다.

가드 안에서 BGM 을 교체하면 `timeline.cuts` 가 정확히 그 상태다 — 컷 구성은 유지되고
`beatLength` 재투영으로 시각만 다시 계산된다. 이걸 무효화로 쓰면 컷 구성을 다시 짜게 되고,
유지로 쓰면 낡은 시각이 남는다. 둘 다 틀린다(B-6).

정의가 명확해서 위반도 보인다 — §9.3 의 소스 창 확대가 그 예다. 시각만 바뀐 것이 아니라
안 보이던 프레임이 들어오므로 `retimed` 로 처리할 수 없고, 그래서 컷별 제약 재검사가 필요하다.

### 15.3 왜 전수 기록인가

**기본값을 허용하면 레이어를 새로 추가했을 때 아무도 판단하지 않은 채 굳는다.**
유지가 기본값이면 조용히 낡고, 무효화가 기본값이면 조용히 낭비한다.

사전에 없는 조합은 기본값이 아니라 예외다.

### 15.4 레이어 이름 ↔ 필드 경로 바인딩

사전은 `"timeline.cuts"` 같은 문자열만 갖고, 그것이 스펙 어디를 가리키는지는 모른다.
**이 바인딩은 이 문서만 쓸 수 있다.**

| 사전의 레이어 이름 | 스펙 필드 |
|---|---|
| `music` | §8 `music` 전체 |
| `timeline.cuts` | §9.1 `timeline.cuts[]` **+ §9.6 `timeline.excluded[]`** |
| `timeline.transitions` | §9.4 `timeline.transitions[]` |
| `overlays.stickers` | §10.1 `overlays.stickers[]` |
| `overlays.captions` | §10.5 `overlays.captions[]` |
| `grade.look` | §11 `grade.look` |
| `grade.match` | §11 `grade.match` |
| `grade.accents` | §11 `grade.accents` |
| `audio.bgm` | §12 `audio.bgm` |
| `audio.sfx` | §12 `audio.sfx[]` |
| `audio.mix` | §12 `audio.mix` |

`analysis`(§7)는 레이어가 아니라 참조다 — 무효화 대상이 아니고 "핀 승격" 축에 속한다.
`seed`·`intent`·`assetRefs`·`source` 는 인제스트가 쓰는 핀이고, `userEdits` 는 최후 적용,
`provenance` 는 기록이라 어느 것도 무효화 대상이 아니다.

⚠️ **`grade.` 세 행은 공통 접두사를 쓰지만 별개 레이어다.** 이 표가 §11 의 하위 구조를 세
레이어로 펼쳐 보이는 것 자체가 경고다. 축이 어떻게 다른지는 §11.1, 사전 쪽 경고는
`layerNotes` 가 갖는다.

📌 **반대로 `excluded` 는 별개 레이어가 아니다.** `timeline.cuts` 와 같은 스테이지가 같은
시점에 쓰므로 함께 움직인다(§9.6). 레이어를 나누는 기준은 이름의 계층이 아니라 **무효화
범위가 갈리는가**다.

### 15.5 가드가 UI 에 드러나야 하는 이유

§9.3 의 두 가드에 걸리면 edit-director 가 다시 돌아 컷 구성이 바뀐다. 사용자는 곡만
바꿨는데 영상이 달라진 것을 겪는다. **가드 통과 여부가 액션의 결과를 바꾸므로 사전에
알려야 한다.**

---

## 16. renderSpec 과의 경계

**출력 기하는 `renderSpec` 단독 권위다.** editSpec 에 `output` 블록은 없다(B-1).

| 값 | 위치 |
|---|---|
| 해상도 · fps · `fitMode` · `outputProfile` | `renderSpec` (`profileVersion` 으로 버전드) |
| 목표 길이 | `intent.targetDurationMs` |
| 실제 길이 | `timeline` 파생 (B-2) |
| 세이프에어리어 | `assetRefs.safeAreaPack` 참조 (B-3) |

`safeArea` 를 값으로 구우면 플랫폼 UI 가 바뀌었을 때 **이미 저장된 스펙 수천 개를 못 고친다.**
에셋은 ID 참조인데 세이프에어리어만 값인 것도 일관되지 않는다.

---

## 17. v2 → v3

**승격은 불가능하다.** v2 에는 비트·레이어·시드가 없어 없는 정보를 지어내야 한다.
`version` 분기 병행이 유일한 선택이고, `parseEditSpec` 폴백을 throw 로 바꾸는 것이 전제다.

⚠️ **큐를 분리한다**(`edit-v3`). 호환 필드 이중 기록은 **실패하지 않기 때문에** 탈락이다 —
구버전 워커가 v3 작업을 v2 로 성공적으로 렌더하고, 스티커·비트·LUT 가 빠진 결과물이 `done`
으로 완료되며, [edit-jobs.ts:69](../../apps/api/src/routes/edit-jobs.ts#L69) 정책상 환급은 실패·취소에만
있으므로 100크레딧이 그대로 소모된다.

유료 export 에서 조용한 품질 저하는 시끄러운 실패보다 나쁘다.
