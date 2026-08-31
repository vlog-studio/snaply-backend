# 에셋 팩 매니페스트 — 스키마

**작성일**: 2026-08-20 · **상태**: 제안 (착수 전) — 현행 사실이 아니다.

착수 순서는 [edit-spec-v3-kickoff.md](./edit-spec-v3-kickoff.md),
스펙 쪽 계약은 [edit-spec-v3.md](./edit-spec-v3.md),
미결은 [backlog.md](../backlog.md) A-7 에만 둔다.

관련: [storage-and-subscription-policy.md](../decisions/storage-and-subscription-policy.md) §3

---

## 0. 범위

스티커 · LUT · 효과음 · BGM · 폰트 · 세이프에어리어를 하나의 구조로 관리한다.
앱 릴리스나 워커 이미지 재빌드 없이 교체 가능해야 한다.

**담지 않는 것**

- **어휘 값** — `anchor` 의 `kind`·`ref`·`scaleRef`, `platform` 허용 집합, 무드 태그 집합,
  전환 `kind` 는 `packages/shared-types/src/*-vocabulary.json` 이 원본이다. §9 는 매니페스트
  필드가 그 어휘를 **어떻게 쓰는지**만 정의한다.
  ⚠️ `anchor` 계열을 뺀 나머지는 **아직 사전 파일이 없다** — 파일을 몇 개로 묶을지가 미결이다.
- **미결 결정** — [backlog.md](../backlog.md) A-7.

---

## 1. 설계 원칙

1. **버전은 URL 에 담는다** — 팩 경로가 불변이므로 무한 캐시가 가능하다.
2. **재빌드 없이 교체** — 워커 이미지에 에셋을 넣지 않는다. 레지스트리만 갱신한다.
3. **`license` 필수** — 비어 있으면 등록 불가. 사람의 기억이 아니라 스키마로 막는다.
4. **모션도 데이터** — 애니메이션을 아트에 굽지 않는다. 아트 N종 × 모션 M종을 에셋 N개로 커버.
5. **은퇴해도 서빙은 유지** — `deprecated` 팩은 새 영상에 안 쓰지만 과거 스펙 재현을 위해
   계속 서빙한다.
6. **재렌더는 레지스트리·번들을 다시 조회하지 않는다** — §11 참조.
7. **생성 시 파라미터는 번들이 갖는다** — 밀도·전환 가중치·보정 상한. 프리셋마다 달라야 하고
   결과가 스펙에 저장되므로 버전 핀이 아니다. §10 참조.

---

## 2. 계층 구조

```
registry.json                        ← 짧은 TTL. 어떤 팩이 존재하는가
  └─ {type}/{packId}/manifest.json   ← 불변. 팩 안에 무엇이 있는가
       └─ {type}/{packId}/{file}     ← 불변. 실제 에셋
```

---

## 3. registry.json

```json
{
  "registryVersion": 1,
  "updatedAt": "2026-08-20T09:00:00Z",

  "packs": [
    {
      "packId": "sticker@2026-08-scribble-a",
      "type": "sticker",
      "url": "https://cdn.example.com/packs/sticker/2026-08-scribble-a/manifest.json",
      "sha256": "3f9a...",
      "status": "active",
      "sizeBytes": 1840000,
      "minAppVersion": "1.4.0"
    }
  ],

  "styleBundles": [
    { "bundleId": "preset_daily@3", "url": "...", "sha256": "77e0...",
      "status": "active", "rollout": 1.0 }
  ]
}
```

⚠️ **`minAppVersion` 은 클라이언트 전용이다.** 워커는 앱 버전을 모른다. 표시하지 않으면
렌더가 앱 버전에 의존하게 된다(D-4).

**`rollout` 은 번들에만 둔다.** 팩 단위로 굴리면 번들이 참조하는 팩이 유저마다 달라져
번들 자체가 재현 불가가 된다. 값은 0~1 비율이며 **신규 생성 경로에서만** 평가된다(§11).

---

## 4. 공통 헤더

```json
{
  "packId": "sticker@2026-08-scribble-a",
  "type": "sticker",
  "schemaVersion": 1,
  "displayName": "손글씨 낙서",
  "status": "active",
  "publishedAt": "2026-08-01T00:00:00Z",
  "baseUrl": "https://cdn.example.com/packs/sticker/2026-08-scribble-a/",

  "license": {
    "source": "commission",
    "holder": "스튜디오명 / 계약번호",
    "commercialUse": true,
    "embedInApp": true,
    "endUserRedistribution": true,
    "attributionRequired": false,
    "attributionText": null,
    "attributionUrl": null,
    "expiresAt": null
  },

  "items": [ ]
}
```

### 4.1 license 검증 — 등록 파이프라인이 거부한다

| 필드 | 요구 | 이유 |
|---|---|---|
| `embedInApp` | `true` | 다수 스톡 라이선스가 **최종 사용자가 파생물을 만드는 앱에 포함**하는 것을 금지한다. 이 제품 형태에 정확히 걸린다 |
| `endUserRedistribution` | `true` | 사용자가 만든 영상을 SNS 에 올리는 행위 |
| `expiresAt` | `null` | §12.1 참조 |

`attributionRequired: true` 면 `attributionText` 와 `attributionUrl` 이 필수다. boolean 만으로는
무엇을 어디에 적을지 알 수 없다(D-3).

**`license` 는 아이템이 팩을 덮는다**(D-2). BGM 처럼 트랙마다 출처가 다른 경우를 위한 것이다.

---

## 5. 스티커 팩

```json
{
  "packId": "sticker@2026-08-scribble-a",
  "type": "sticker",

  "motions": {
    "popOvershoot": {
      "in":   { "scale": [0, 1.15, 1.0], "durationMs": 250, "easing": "backOut" },
      "idle": { "rotation": [-2, 2], "periodMs": 1800 },
      "out":  { "scale": [1.0, 0.9], "opacity": [1, 0], "durationMs": 150, "easing": "easeIn" }
    },
    "drawOn": {
      "in":  { "clipReveal": "leftToRight", "durationMs": 320, "easing": "easeInOut" },
      "out": { "opacity": [1, 0], "durationMs": 120 }
    }
  },

  "items": [
    {
      "assetId": "scribble_heart_01",
      "file": "scribble_heart_01.png",
      "sha256": "a870...",
      "intrinsicSize": [512, 512],

      "anchorAffinity": [
        { "kind": "face", "ref": "aboveHead", "offset": [0, -0.45] },
        { "kind": "face", "ref": "cheekL" },
        { "kind": "freezone", "ref": "topRight" }
      ],
      "scale": { "ref": "faceWidth", "default": 0.40, "min": 0.20, "max": 0.75 },
      "rotationFollows": true,

      "conceptTags": ["heart", "affection"],
      "assetMoodTags": ["cozy", "playful"],
      "defaultMotion": "popOvershoot",
      "sfxId": "sparkle_01",
      "status": "active"
    }
  ]
}
```

**`defaultAnchor` 는 없다.** `anchorAffinity[0]` 이 곧 기본값이다 — 두 필드를 두면 어긋날 여지가
생긴다(E).

⚠️ **무드 태그는 `assetMoodTags` 다. BGM 의 `moodTags` 와 다른 어휘 집합이다.** §5.1 참조.

### 5.1 무드 어휘가 둘인 이유

현행 `calm` · `upbeat` · `daily` 는 [editor.py:34-38](../../apps/ai-worker/src/pipeline/editor.py#L34-L38)
의 **BGM 디렉터리 이름**(프리셋 → 디렉터리 매핑)이지 무드 어휘가 아니다.

그 3값으로 스티커·LUT 의 무드를 표현하면 어휘가 빈약하고, 번들의 `bgm.filter` 와 섞이면
서로 다른 프리셋의 태그가 한 배열에 들어간다.

| 필드 | 어휘 집합 | 소비처 |
|---|---|---|
| BGM 의 `moodTags`, 번들의 `bgm.filter.moodTags` | BGM 어휘 (현행 3값) | 트랙 선택 |
| 스티커·LUT 의 `assetMoodTags` | 에셋 무드 어휘 (확장 가능) | 아이템 선택 |

두 집합을 사전에 나눠 두고 **`bgm.filter` 가 BGM 어휘만 쓰도록 검증**하면 이 혼동이
기계적으로 막힌다.

---

## 6. LUT 팩

```json
{
  "packId": "lut@2026-08",
  "type": "lut",

  "items": [
    {
      "assetId": "film_warm_03",
      "file": "film_warm_03.cube",
      "sha256": "e441...",
      "gridSize": 33,
      "inputColorspace": "rec709",
      "defaultIntensity": 0.8,
      "assetMoodTags": ["cozy", "nostalgic"],
      "sceneAffinity": ["indoor", "goldenhour"],
      "status": "active"
    }
  ]
}
```

**`grain`·`vignette`·`halation` 은 여기 없다.** `.cube` 는 `lut3d` 필터 한 줄이고 halation 은
밝은 영역 추출 + 블러 + 스크린 블렌드라 필터그래프가 붙는다. 구현 비용도 재인코딩 영향도
다르므로 후처리 파라미터로 분리해 번들이 갖는다(D-1, §10).

⚠️ **`inputColorspace` 는 필드만으로 지켜지지 않는다.** "톤매핑 → LUT" 순서는
[edit-spec-v3.md](./edit-spec-v3.md) §11.4 의 파이프라인 계약이다. 순서가 안 정해지면 필드만
있고 아무도 안 지킨다(C-4).

`sceneAffinity` 는 신규 생성 경로에서만 평가되는 쿼리형 필드다(§11).

---

## 7. 효과음 · BGM · 폰트 팩

### 7.1 효과음

```json
{
  "assetId": "whoosh_02",
  "file": "whoosh_02.wav",
  "sha256": "5a03...",
  "durationMs": 420,
  "peakOffsetMs": 80,
  "gainDb": -12,
  "triggerKinds": ["whip", "slide"],
  "status": "active"
}
```

**`peakOffsetMs`** — 소리의 피크는 파일 시작과 다르다. whoosh 는 80ms 뒤에 피크가 오므로
전환 시점에 피크를 맞추려면 그만큼 먼저 재생해야 한다. 이 값이 없으면 효과음이 미묘하게
늦게 들리고 원인을 찾기 어렵다.

⚠️ **프리롤이 타임라인 0 이전이 되면 클램프한다**(D-7). 첫 전환에서 실제로 발생한다.

**`gainDb` 는 기본값이다.** 스펙의 `audio.sfx[].gainDb` 가 있으면 그쪽이 이긴다(D-8).

**`triggerKinds` 는 전환 어휘의 상위집합이다** — `"sticker"` 를 포함한다(D-5).
`hardcut`·`crossfade` 는 의도적으로 어떤 아이템에도 없다(무음).

전환 `kind` 의 **집합은 사전**이고 §10 의 `transitionWeights` 는 그 집합에 매기는 **가중치**다.
렌더러가 `kind` 로 스위치해 다른 필터그래프를 만들므로 값이 아니라 어휘다 —
`bgm.filter.moodTags` 와 같은 구조다([edit-spec-v3.md](./edit-spec-v3.md) §9.4).

### 7.2 BGM

```json
{
  "assetId": "bgm_lofi_014",
  "file": "bgm_lofi_014.m4a",
  "sha256": "cc71...",
  "durationMs": 186000,
  "bpm": 92,
  "beatGridMs": [0, 652, 1304, 1957, 2609],
  "beatGridVersion": 1,
  "downbeatIdx": [0, 4, 8],
  "sections": [ { "name": "intro", "startBeat": 0, "endBeat": 8 } ],
  "loopPoints": { "startMs": 13040, "endMs": 117360 },
  "moodTags": ["calm"],
  "energy": 0.35,
  "license": {
    "source": "uppbeat",
    "commercialUse": true,
    "embedInApp": true,
    "endUserRedistribution": true,
    "contentIdCleared": true,
    "expiresAt": null
  },
  "status": "active"
}
```

⚠️ **`contentIdCleared` 가 false 인 트랙은 노출하지 않는다.** 사용자 영상이 플랫폼에서 무음
처리되고, 그 클레임은 전부 CS 로 돌아온다.

`beatGridMs` 는 오프라인 분석 결과를 굽는다. 런타임 분석은 없다.
스펙에는 **사용 구간만 잘라** 스냅샷된다([edit-spec-v3.md](./edit-spec-v3.md) §8.2).

⚠️ **`bpm` 은 표시·필터용이다.** 시각 계산의 원천은 `beatGridMs` 배열이며, 92 BPM 트랙의
간격이 652/652/653/652 로 갈리는 이유와 그 귀결은 [edit-spec-v3.md](./edit-spec-v3.md) §8.1 에 있다.

`moodTags` 는 BGM 어휘를 쓴다(§5.1).

### 7.3 폰트

```json
{
  "assetId": "pretendard_bold",
  "family": "Pretendard",
  "weight": 700,
  "scripts": ["Hang", "Latn"],
  "renditions": {
    "server": { "file": "Pretendard-Bold.otf", "sha256": "0ab4..." },
    "client": { "file": "Pretendard-Bold.woff2", "sha256": "77c1..." }
  },
  "usedByStyles": ["badgeOutline", "caption"],
  "license": { "spdx": "OFL-1.1", "embedAllowed": true, "serverRenderAllowed": true },
  "status": "active"
}
```

⚠️ **서버 렌더용은 TTF/OTF 다.** woff2 는 웹 전용 포맷이라 libass → fontconfig/freetype 경로가
인식하지 못한다(C-1).

**폰트 적재는 `fc-cache` 가 아니라 `ass` 필터의 `fontsdir=` 로 한다.** 팩 폰트는 런타임에
도착하므로 빌드 타임 `fc-cache` 로는 안 잡히고, 컨테이너 안에서 시스템 폰트 설정을 매번
바꿔야 한다. LRU 캐시 디렉터리를 `fontsdir` 로 직접 가리키면 fontconfig 를 건드릴 필요가 없다.

**이미지에는 두부 방지용 기본 한글 폰트 하나만 굽는다.** `scripts` 에 `Hang` 이 없는 폰트로
한글을 렌더하면 □ 가 나온다.

⚠️ 손글씨 계열 한글 무료 폰트는 **개인 사용만 허용**이 많다. 서버 렌더링은 임베딩에 해당할
수 있으므로 `serverRenderAllowed` 를 별도 필드로 둔다.

---

## 8. 세이프에어리어 팩

```json
{
  "packId": "safearea@2026-08",
  "type": "safearea",

  "items": [
    {
      "assetId": "tiktok_9x16",
      "platform": "tiktok",
      "aspect": "9:16",
      "insets": { "top": 0.10, "bottom": 0.20, "left": 0.03, "right": 0.12 },
      "measuredAt": "2026-08-15",
      "measuredOn": "iPhone 15 Pro / TikTok 34.2",
      "status": "active"
    }
  ]
}
```

7번째 팩 타입이다(B-3). 불변 버전 + 계속 서빙 + 갱신 주기가 다른 팩과 같다.

**값(수치)은 팩이고 키(플랫폼 이름)는 사전이다.** `insets` 는 플랫폼 UI 개편을 따라 바뀌는
측정값이라 팩이 맞다. `platform` 의 허용 집합은 코드가 스위치하는 어휘이므로
`anchor-vocabulary.json` 과 같은 부류로 사전에 둔다.

**실기기 캡처로 실측한다.** 추정값을 넣으면 스티커가 UI 아래에 깔린다.

---

## 9. anchor 어휘 — 매니페스트가 쓰는 방식

**어휘 값은 여기 없다.** `kind`·`ref`·`scaleRef`·`defaultScaleRef`·`supportsRotation`·`tieEpsilon` 은
`packages/shared-types/src/anchor-vocabulary.json` 이 원본이다.

사전은 어휘를 알고, 매니페스트는 **자기 필드가 그 어휘를 어떻게 쓰는지**를 안다.
아래 다섯은 사전이 가질 수 없다.

### 9.1 `anchorAffinity` 는 정렬된 선호 목록이다

앞에 올수록 선호하며 **`[0]` 이 기본값**이다. 배치 단계는 배열을 순회하며 필요한 분석 결과가
있는지 확인하고, 없으면 다음으로 넘어간다.

사전은 어휘만 알 뿐 "정렬된 선호 목록"이라는 것은 이 필드의 의미다.

### 9.2 `anchorAffinity` 에 `drop` 을 쓰지 않는다

스펙의 `fallback` 과 규칙이 **정반대**다.

| 필드 | 규칙 | 검증 |
|---|---|---|
| `fallback` ([edit-spec-v3.md](./edit-spec-v3.md) §10.4) | `drop` 으로 **끝나야** 한다 | `isValidFallbackChain()` |
| `anchorAffinity` | `drop` 을 **포함하면 안 된다** | `isValidAnchorAffinity()` |

`isValidAnchor({kind:"drop"})` 는 참이므로 전용 검증이 없으면 매니페스트에 `drop` 이 들어가도
잡히지 않고, 그 에셋은 **"아무 데도 안 붙임"을 선호하는** 팩 아이템이 된다.

두 함수가 TS · 워커 양쪽에 있고, 같은 배열이 한쪽에서 통과하고 다른 쪽에서 거부되는 것을
테스트가 고정한다.

### 9.3 `scale.ref` 는 `kind` 의 `defaultScaleRef` 와 맞춰야 한다

사전에 `defaultScaleRef` 는 있지만 "팩 아이템이 어긋나게 쓰면 안 된다"는 규칙은 이쪽이다.

얼굴 앵커인데 `frameWidth` 를 쓰면 클로즈업에서 스티커가 작아 보인다.

### 9.4 `rotationFollows: true` 는 `supportsRotation` 인 `kind` 에서만 의미 있다

두 필드가 서로 다른 파일에 있는 **교차 제약**이다. 어느 쪽 단독으로는 표현할 수 없다.

하트·안경류는 `true`, 텍스트 배지는 `false`(기울면 읽기 어렵다).

### 9.5 등록 파이프라인이 사전으로 `anchorAffinity` 를 검증한다

운영 규칙이다. 등록 시점에 막지 않으면 렌더 시점에 스티커가 조용히 사라진다.

### 9.6 파생 공식

MediaPipe Face Detection 6키포인트에 `cheekL`·`cheekR`·`chin` 이 없으므로 bbox 와 키포인트에서
파생한다. 공식은 **파이썬 단독 구현**이며 `derivationVersion` 으로 버전드다.

`resolved` 가 재계산 가능한 캐시인 이상 재계산 가능성이 곧 재현성이므로,
버전은 [edit-spec-v3.md](./edit-spec-v3.md) §5 `assetRefs.derivationVersion` 에 핀된다(C-3).

⚠️ **파생은 클램프하지 않는다.** 프레임 밖 좌표가 그대로 나온다 —
[edit-spec-v3.md](./edit-spec-v3.md) §10.3 참조.

동률 비교는 사전의 `tieEpsilon` 을 쓴다. 부동소수 오차가 `beside` 의 좌우 판정을 뒤집는 것이
실제로 발생했다.

---

## 10. styleBundle

```json
{
  "bundleId": "preset_daily@3",
  "displayName": "일상",
  "status": "active",

  "stickerPack": "sticker@2026-08-scribble-a",
  "sfxPack": "sfx@2026-07",
  "fontPack": "font@1",
  "safeAreaPack": "safearea@2026-08",

  "look": {
    "lutPack": "lut@2026-08",
    "lutAssetId": "neutral_crisp_01",
    "intensity": 0.7,
    "grain": 0.05,
    "vignette": 0.0,
    "halation": 0.0
  },

  "correction": {
    "exposure":   { "neutral": 0,   "max": 0.15 },
    "tempShift":  { "neutral": 0,   "max": 0.10 },
    "tintShift":  { "neutral": 0,   "max": 0.08 },
    "saturation": { "neutral": 1.0, "max": 0.15 }
  },

  "bgm": {
    "packId": "bgm@2026-08",
    "filter": { "moodTags": ["calm"], "energyRange": [0.2, 0.5] }
  },

  "density": {
    "stickersPerMinute": 18,
    "maxConcurrentStickers": 1,
    "transitionRatioMax": 0.40,
    "minCutMs": 500,
    "maxCutMs": 2500,
    "captionStyle": "badgeOutline"
  },

  "transitionWeights": {
    "hardcut": 1.0, "crossfade": 0.6, "whip": 0.8,
    "zoompunch": 0.5, "slide": 0.6, "flash": 0.2
  }
}
```

### 10.1 `correction` — 보정 상한

[edit-spec-v3.md](./edit-spec-v3.md) §11.3 의 상한값이다. 판정식은 네 필드에 공통이다.

```
|value − neutral| ≤ max
```

걸리면 `grade.match` 의 해당 클립에 `clamped: true` 가 기록되고 부분 보정만 한다.

**키는 `grade.match.perClip[*].corrections` 의 필드명과 동일하다.** 이름을 붙여 대응시키면
대응이 관례로 남지만, 키가 같으면 `Object.keys()` 대조 한 줄로 기계가 검사한다.
보정값이 `corrections` 하위에 묶인 이유가 이것이다 — `clamped`·`reason` 과 같은 층에 두면
집합이 달라져 검사가 항상 실패한다.

⚠️ 대조가 **완전 일치**이므로 스펙 쪽도 네 필드를 항상 기록한다(중립값이어도 생략하지 않는다).

### 10.1.1 `neutral` 이 필요한 이유

`saturation` 만 중립값이 다르다. FFmpeg 필터 기본값 기준이다.

| 필드 | 필터 | 중립값 | 단위 |
|---|---|---|---|
| `exposure` | `eq=brightness` | 0.0 | 가산 |
| `saturation` | `eq=saturation` | 1.0 | **배수** |
| `tempShift` · `tintShift` | `colorbalance` | 0 | 가산, −1~1 정규화 게인 |

`saturation: 1.02` 는 배수이고 `exposure: 0.06` 은 가산이다. `maxSaturationDelta` 같은 이름은
이 차이를 감추면서 `saturation` 이 가산인 것처럼 읽히게 만든다. `neutral` 을 명시하면 차이가
데이터로 드러나고 상한 판정이 네 필드에 같은 식 하나로 돈다.

`saturation` 을 가산으로 바꾸지 않은 이유: `eq=saturation=` 이 배수를 받으므로 저장값이 필터로
그대로 들어가는 성질이 깨진다.

⚠️ **`tempShift` 는 켈빈이 아니다** — [edit-spec-v3.md](./edit-spec-v3.md) §11.2 참조.

⚠️ **`tintShift` 상한이 빠지면 무제한이 된다.** 그린-마젠타 시프트는 색온도만큼 눈에 띄고,
형광등 아래 촬영분에서 정확히 이 축이 튄다. 한쪽만 제한하면 보정이 그쪽으로 몰린다.

📌 **위 `max` 값 넷은 비율만 맞춘 자리표시자다.** 실제 클립으로 정해야 한다.
지금 요점은 "값이 있다"와 "네 필드 전부 있다"이다.

### 10.1.2 왜 버전 핀이 아닌가

`grade.match` 는 결과가 스펙에 저장되고 재계산되지 않는다.
`tieEpsilon`(`resolved` 를 재계산하므로 핀 필요)과 다른 부류다.

프리셋마다 달라야 하는 값이므로 `density` 와 같은 자리다 — 감성은 공격적인 매칭을 허용하고
일상은 보수적으로 간다.

### 10.2 `density` 가 데이터인 이유

"3초에 1개 이하, 동시 2개 금지"가 코드에 박히면 프리셋마다 다르게 만들 수 없다.
감성 프리셋은 스티커가 적고 컷이 길어야 하는데, 그것이 값 차이로 표현된다.

### 10.3 쿼리형 필드

`bgm.filter` · `transitionWeights` · `correction` · `density` 는 **신규 생성 경로에서만** 평가된다(§11).

`bgm.filter.moodTags` 는 **BGM 어휘만** 쓴다(§5.1). 에셋 무드 어휘가 섞이지 않도록 검증한다.
`transitionWeights` 의 키도 같은 방식으로 전환 어휘에 대해 검증한다(§7.1).

---

## 11. 재렌더 규칙

> **재렌더는 레지스트리·번들을 다시 조회하지 않는다. 스펙에 핀된 `packId`·`assetId` 만
> 해석한다. 쿼리형·생성 시 필드는 신규 생성 경로에서만 평가된다.**

해당 필드: `rollout` · `bgm.filter` · `sceneAffinity` · `transitionWeights` · `density` · `correction`.

규칙 하나가 필드별 주의보다 낫다. `registry.json` 의 TTL 5분과 `rollout` 조합이 안전한 것도
이 규칙 덕분이다.

**팩 교체는 새 `packId` 를 핀하는 재생성이며, 나머지 핀은 유지된다.** 이 규칙과 충돌하지
않는다.

---

## 12. 상태와 라이선스

```
experimental  →  active  →  deprecated
 (rollout 0.1)              (신규 사용 중단, 서빙은 계속)
```

**`retired` 는 없다.** 초안에는 있었으나 "신규 생성 제외 + 기존 스펙 서빙"이 `deprecated` 의
정의와 같아 존재 이유가 없다.

서빙을 반드시 멈춰야 하는 경우(저작권 클레임, 법적 삭제 요구)는 **긴급 차단**으로 별도
처리하며 라이선스 만료는 그 사유가 아니다. 드물지만 0 은 아니므로 사용자에게 무엇을 보여줄지
(대체 렌더 / 환급 / 고지)는 결정 문서에 남긴다.

### 12.1 `expiresAt: null` 필수

[storage-and-subscription-policy.md](../decisions/storage-and-subscription-policy.md) §3 은 무비
30일 만료 후 **크레딧 소모 없이 언제든 재생성**을 확정했다. 라이선스 만료로 팩을 못 쓰게 되면
그 약속이 깨진다 — 사용자는 이미 100크레딧을 낸 결과물을 영구히 잃는다.

**이건 스키마 문제가 아니라 조달 요건이다.** `expiresAt` 이 `null` 이 아니면 등록을 거부한다.

⚠️ 구독형 BGM 라이선스(Epidemic·Uppbeat 등)는 대개 "구독 기간 중 제작한 콘텐츠는 이후에도
사용 가능" 구조인데, **만료 후 재렌더가 "기존 콘텐츠 사용"인지 "신규 제작"인지**가 계약서마다
다를 수 있다. 법률 판단이 필요하며 [backlog.md](../backlog.md) A-7 에 열려 있다.
조달 단계에서 **"신규 배포 중단 / 기존 저작물 유지" 분리 조항**을 협상 항목으로 올린다.

### 12.2 sha256 불일치

워커는 다운로드 후 검증하고 불일치면 렌더를 실패시킨다. 잘못된 에셋으로 렌더하는 것보다 낫다.

⚠️ 유료 export 는 크레딧 환급으로 구제되지만 **무료 재생성 경로는 구제 수단이 없다.**
운영상 이 실패가 나오면 안 되므로 팩 게시 파이프라인에서 해시를 먼저 확정한다.

---

## 13. 배포 · 캐싱

| 대상 | 캐시 | 이유 |
|---|---|---|
| `registry.json` | TTL 5분 | 팩 교체가 빠르게 반영돼야 함 |
| `manifest.json` | immutable, 1년 | `packId` 에 버전이 있어 내용이 변하지 않음 |
| 에셋 파일 | immutable, 1년 | 동일 |

- 워커는 팩을 로컬 디스크에 LRU 캐시한다. 폰트는 그 디렉터리를 `fontsdir` 로 직접 가리킨다.
- 클라이언트는 프리뷰용으로 스티커 썸네일과 woff2 렌디션만 받는다.
- **클라이언트 프리뷰에 LUT 를 적용하지 않는다.** 근사 렌더는 "프리뷰와 결과가 다르다"는 CS 를
  만들고, 그건 스키마로 못 막는다. 프리뷰는 `grade.match` 까지만 보여준다.

---

## 14. 운영 — 은퇴 판단

`userEdits.removedStickerIds` 를 `assetId` 로 집계한다.

```
deletionRate(assetId) = 삭제된 횟수 / 적용된 횟수
```

임계를 넘으면 `deprecated` 후보다. 디자이너 취향이 아니라 데이터로 은퇴 목록을 정한다.
LUT 는 프리셋 변경률로 같은 판단을 한다.

**월 1회 리뷰**로 5~10종을 교체한다. 이 루프가 없으면 어떤 아키텍처도 트렌드를 따라가지
못한다.

---

## 15. 조달

| 방법 | 판단 |
|---|---|
| 디자이너 커미션 40~60종 / 3~4스타일 | ✅ 권장. 저작권이 깨끗하고 차별점이 된다 |
| 스톡 구매 | ⚠️ 다수가 `embedInApp` 을 금지한다 (§4.1) |
| AI 생성 | 스타일 일관성이 안 나온다. 탐색용 |
| CC 무료 세트 | 무료지만 무료처럼 보인다 |

**유니코드 이모지는 쓰지 않는다.** 플랫폼 기본 스티커와 구분이 안 돼 제품의 이유가 사라진다.

**밈·캐릭터·로고는 넣지 않는다.** 수명이 몇 주이고 대부분 저작권 침해다.
