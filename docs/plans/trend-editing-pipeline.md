# 트렌드 숏폼 편집 파이프라인 구현 계획 — 타임라인 스펙 v3

작성일 2026-08-19 · 상태: **제안 (착수 전)** — 현행 사실이 아니다.
현행 파이프라인의 사실은 [progress.md](../progress.md) Phase 5, 현행 계약은
[api-spec.md](../api-spec.md)에 있다. 미결 항목은 [backlog.md](../backlog.md) A-7 에만 둔다.

관련: [decisions/storage-and-subscription-policy.md](../decisions/storage-and-subscription-policy.md) §3.2(레시피 재생성)
· [decisions/movie-model.md](../decisions/movie-model.md) · [decisions/credit-payment-model.md](../decisions/credit-payment-model.md)

---

## 1. 문제 — 부족한 것은 타임라인 모델

현행 `editSpec` v2 는 **클립 목록 + 프리셋 이름**이다.

```json
{ "version": 2, "stylePreset": "감성", "clips": [{ "videoId": "…", "startMs": 0 }] }
```

틱톡·릴스형 브이로그는 최소한 **비트 그리드 · 레이어 · 키프레임** 세 가지를 표현할 수 있어야
만들어진다. librosa 를 붙이고 이모지 PNG 를 확보해도, 스펙이 "0.48초에 컷, 이 좌표에 스티커를
300ms 동안 pop-in" 을 담지 못하면 파이프라인에 전달할 방법이 없다.

그래서 **스펙 v3 설계가 오픈소스 선정보다 먼저다.** 이 순서를 뒤집으면 표현 하나를 추가할 때마다
워커에 하드코딩이 쌓이고, 아래 §2 의 재생성 결정론이 조용히 깨진다.

다행히 기존 설계가 이 확장을 이미 받아들이게 돼 있다 —
`parse_job_clips` 는 v2 `clips` 와 레거시 `videoIds` 를 함께 처리하고,
`parse_render_spec` 은 `profileVersion` 으로 갈린다. v3 는 같은 자리에 한 갈래를 더하는 일이다.

---

## 2. 선행 제약 — 이 계획이 지켜야 하는 기존 결정

### 2.1 레시피 재생성 결정론 ★ 지금 깨져 있다

[storage-and-subscription-policy.md](../decisions/storage-and-subscription-policy.md) §3.2 는
만료된 무비를 영구 보관된 `editSpec`+`renderSpec` 으로 **크레딧 없이 무료 재생성**한다고 확정했다.
그런데 현행 BGM 선택은 디렉터리 스캔 + `random.choice` 다
([`pipeline/music.py`](../../apps/ai-worker/src/pipeline/music.py)). 즉 **지금도 재생성하면
BGM 이 바뀐다.** 비트 싱크를 넣으면 컷 지점까지 바뀐다 — 사용자는 "복원"을 눌렀는데 다른
영상을 받는다.

**v3 는 비결정적 선택을 전부 스펙에 핀으로 박는다**: 선택된 트랙 ID, 비트 그리드 버전,
난수 시드. 이것이 v3 의 존재 이유 중 하나이며, 표현력 확장보다 우선순위가 높다.

### 2.2 클립 구간의 소유자는 클라이언트다

`clips[].startMs/endMs` 는 전부 앱이 보낸다([api-spec.md](../api-spec.md) `POST /edit-jobs`).
서버가 컷을 비트에 스냅하면 **사용자가 직접 자른 구간을 서버가 덮는다.**
v3 는 스냅 여부(`snapToBeat`)와 허용 오차를 클립 단위로 명시하고, 기본값은 "덮지 않음"이다.

### 2.3 비용·시간 상한

`EDIT_TIMEOUT_SECONDS`(기본 10분)와 export 1회 = 100크레딧이라는 단가 가정이 있다.
분석·레이어 합성이 늘면 두 값이 함께 흔들린다. 단계를 추가할 때마다 처리 시간을 계측해
남기고, 상한을 넘기면 기능이 아니라 상한을 먼저 재검토한다.

### 2.4 v3 를 어디에 붙일지가 아직 회의 안건이다 ⚠️

`Movie` 엔티티([backlog.md](../backlog.md) A-1)가 없고, **기존 `POST /edit-jobs` 의 수명**이
[meetings/next-agenda.md](../meetings/next-agenda.md) §1-5 의 미결 안건이다. 권장안
B(Movie export 내부에서 재사용한 뒤 공개 API 폐기를 판단)가 채택되면 v3 의 부착 지점은
`POST /edit-jobs` 가 아니라 Movie export 가 된다.

**타임라인 모델 자체(§3)는 부착 지점과 무관하므로 설계는 지금 진행할 수 있다.** 다만 요청
스키마와 라우트는 §1-5 가 닫힌 뒤에 확정한다 — 먼저 굳히면 같은 스펙을 두 번 만든다.

### 2.5 워터마크 결정이 레이어 설계의 입력이다

[next-agenda.md](../meetings/next-agenda.md) §2-5 는 해상도·워터마크를 미결로 두고 있고
권장안은 "1차는 모든 크레딧 export 를 1080×1920, 워터마크 없음"이다. 워터마크를 넣기로 하면
그것도 오버레이 레이어이므로 §3 의 `layers` 가 이를 표현할 수 있어야 한다. 이 계획은 권장안
(워터마크 없음)을 가정하되, 레이어 타입에 `watermark` 를 넣을 자리를 비워 둔다.

---

## 3. editSpec v3 — 타임라인 모델

```jsonc
{
  "version": 3,
  "stylePreset": "감성",
  "seed": 1837462,                    // 모든 무작위 선택의 원천 (§2.1)
  "audio": {
    "trackId": "uuid",                // bgm_tracks 참조 — 핀
    "beatGridVersion": 1,             // 그리드 재계산 시 과거 레시피 보호
    "startOffsetMs": 0,
    "duckingDb": -9
  },
  "timeline": {
    "clips": [
      { "videoId": "…", "startMs": 3500, "endMs": 8000,
        "snapToBeat": false, "beatCount": null, "speed": 1.0 }
    ],
    "transitions": [
      { "afterClip": 0, "type": "slideleft", "durationMs": 300 }
    ],
    "layers": [
      { "type": "caption", "style": "pop", "trackIndex": 0 },
      { "type": "sticker", "assetId": "sparkle", "anchor": { "x": 0.72, "y": 0.18 },
        "keyframes": [ { "tMs": 0, "scale": 0 }, { "tMs": 300, "scale": 1.0 } ] }
    ]
  }
}
```

원칙 넷:

- **레이어는 클립이 아니라 타임라인에 붙는다.** 스티커가 컷을 가로질러 살아남아야 한다.
- **키프레임은 절대 시각(ms)** 이다. 클립 인덱스 기준이면 컷 하나만 바뀌어도 전부 어긋난다.
- **좌표는 정규화(0~1)** 다. `renderSpec` 의 출력 프로필이 바뀌어도 배치가 살아남는다.
- **워커는 스펙을 신뢰하되 검증한다.** 현행 `parse_render_spec` 이 이미 그 태도다 —
  범위를 벗어난 값은 폴백이 아니라 거부한다.

`beatCount` 는 `movie_template_slots` 와 자연스럽게 맞물린다 — 슬롯이 "몇 비트짜리 자리인가"를
가지면 추천 결과를 그대로 타임라인으로 펼칠 수 있다. 다만 이는 A-6 앱 연동 이후의 후속이다.

---

## 4. 분석 층 — 무엇을 언제 자를지, 어디에 붙일지

| 필요 기능 | 방법 | 런타임 의존성 |
|---|---|---|
| 비트 그리드 | 큐레이션된 소수 트랙을 **오프라인에서 1회** librosa 로 분석 → `bgm_tracks` 에 저장 | **0** (스크립트만) |
| 무음 제거·점프컷 | faster-whisper 의 Silero VAD (`vad_filter=True`) — **이미 쓰고 있다** | **0** |
| 단어 단위 자막 타이밍 | 같은 호출에 `word_timestamps=True` | **0** |
| 스티커 free-zone (얼굴 회피) | MediaPipe face/pose, 1~2fps 샘플링 → bbox → 여백 계산 | MediaPipe |
| 무슨 스티커·무슨 무드 | 기존 GPT vision 분석 확장 (`{t, sticker, anchor, intensity}`) | 0 |

**비트 그리드를 오프라인 사전계산으로 두는 것이 이 계획의 핵심 선택이다.** 런타임에
librosa(numpy/scipy/numba, 수백 MB)가 들어오지 않고, 워커 콜드스타트가 늘지 않으며,
결정론적이라 §2.1 을 지킨다.

**"어디에"는 MediaPipe, "무엇을"은 LLM** 으로 역할을 쪼갠다. 매 프레임 LLM 을 부르면 비용과
지연이 감당되지 않는다.

MediaPipe 도입 시 확인할 것: 워커 이미지는 이미 faster-whisper 로 무겁다(compose 검증에서
빌드를 생략한 전례가 있다 — [progress.md](../progress.md) Phase 9). ARM 휠 가용성과 증가분을
측정한 뒤 넣는다.

---

## 5. 표현 층

### 5.1 자막 — ASS/libass 전환 ⚠️ 제품 변경이다

현행은 `subtitles` 필터가 아니라 **mov_text 소프트 자막**이다
([`pipeline/subtitle.py`](../../apps/ai-worker/src/pipeline/subtitle.py)). 단어 단위 애니메이션은
원리적으로 불가능하다. FFmpeg 의 `ass` 필터가 libass 를 쓰므로 오버라이드 태그로
카라오케 하이라이트(`\k`), 스케일 pop(`\t(0,120,\fscx120\fscy120)`), 페이드·클리핑이 전부 된다.
**새 라이브러리는 0이고 문자열 생성 로직만 필요하다** — 필터그래프를 직접 조립하는 현행 스타일과
결이 같다.

**다만 소프트 → 번인은 사용자에게 보이는 변경이다.** [api-spec.md](../api-spec.md) 는
"영상에 굽지 않으므로 플레이어에서 켜야 보인다"고 FE 에 고지해 두었다. 자막을 끌 수 없게 되고,
`-c:v copy` 가 깨져 재인코딩이 한 번 는다. **착수 전에 결정 문서가 필요하다**(backlog A-7).

폰트가 준비물이다 — Pretendard 또는 Noto Sans KR(둘 다 OFL)을 이미지에 설치하고 fontconfig
캐시를 만든다. 한글 글리프가 없으면 전부 두부(□)로 렌더링된다.

### 5.2 스티커 — 알파 트랙 1장으로 합성

`drawtext` + Noto Color Emoji 는 **안 된다.** FFmpeg 의 libfreetype 경로는 COLR/CBDT 컬러
글리프를 렌더링하지 못해 흑백이나 빈 박스가 나온다.

- 스티커를 **알파 채널 WebM(VP9) 또는 APNG** 로 사전 렌더링 — pop-in/bounce 를 미리 굽는다
- 런타임은 `overlay` + `enable='between(t,a,b)'` + MediaPipe 좌표 대입뿐
- 스티커가 5개를 넘으면 overlay 체인이 지저분해진다 → **길이 전체의 RGBA 오버레이 트랙 1장**을
  만들어 단일 `overlay` 로 합성한다. 필터그래프가 평평해지고 캐싱·교체가 쉬워진다

에셋 라이선스: **Noto Color Emoji(OFL)** 가 상업 앱에 가장 무해하다. OpenMoji 는 CC-BY-SA 로
share-alike 가 파생 그래픽에 걸릴 수 있고, Twemoji 는 CC-BY 로 표기 의무가 있다.

### 5.3 전환·모션 — 의존성 0

- `xfade` 종류 확장(`slideleft`·`wipeup`·`circleopen`·`pixelize`·`squeezev`·`hlslice`)
- 줌 펀치·휩팬은 xfade 가 아니라 `crop`+`scale` 시간 표현식 또는 `zoompan`
- 속도 램프는 `setpts`/`atempo`
- 오토리프레임: MediaPipe bbox → 스무딩된 crop 경로. 현행 `blur_background` 는 폴백으로 남긴다
- 안정화(`vidstab`)는 2-pass 로 비싸고 GPL 이슈가 겹친다 — 후순위(§8)

---

## 6. 출력 층 — 한 줄짜리 수정들

- `-movflags +faststart` — 없으면 moov atom 이 파일 끝에 남아 스트리밍 첫 재생이 지연된다
- `-crf 20`, `-profile:v high` (현재 CRF 미지정 = 기본 23)
- `loudnorm=I=-14:TP=-1.5:LRA=11` — 플랫폼 정규화 타겟. 안 맞추면 업로드 후 소리가 뭉개진다
- BGM 덕킹 `sidechaincompress` — 사이드체인 소스는 concat 된 원본 오디오 트랙을 그대로 물린다

**재인코딩 횟수에 주의한다.** 현재 BGM·자막 단계가 `-c:v copy` 라 2회에 그치는데, 번인 자막과
스티커가 붙으면 그 단계에서도 필터가 필요해 `copy` 가 깨진다. normalize 이후를
**단일 `filter_complex` 로 통합**하면 세대 손실·처리 시간·구조 복잡도를 한 번에 잡는다.

---

## 7. `bgm_tracks` — BGM 을 1급 엔티티로

현행 BGM 은 **디렉터리 스캔 + 무작위 선택**이 전부다. 트랙 ID 가 없으므로 레시피에 핀을 박을
수도, 비트 그리드를 붙일 수도, 라이선스를 감사할 수도 없다.

| 컬럼 | 이유 |
|---|---|
| `id`, `title`, `object_key` | 레시피가 참조할 안정된 식별자 |
| `mood_tag` | 현행 프리셋 태그(`calm`/`upbeat`/`daily`) 승계 |
| `bpm`, `beat_grid`(jsonb), `downbeats`, `loop_points` | 오프라인 분석 산출물 |
| `beat_grid_version` | 재분석해도 과거 레시피가 같은 결과를 내도록 |
| `license_provider`, `license_terms_url`, `allows_end_user_social_upload` | §8 의 감사 대상 |

`-stream_loop -1` 로 반복 중인데 **루프 경계가 마디에 맞지 않으면 그 지점에서 그리드가 깨진다.**
`loop_points` 는 선택이 아니라 비트 싱크의 전제다.

---

## 8. 오픈소스 선정과 라이선스

**안전 목록**: librosa(ISC) · MediaPipe(Apache 2.0) · OpenCV(Apache 2.0) · Silero VAD(MIT) ·
faster-whisper·CTranslate2(MIT) · libass(ISC) · Pretendard·Noto(OFL).

**후보에서 제외** — 상업 서비스이므로:

| 후보 | 라이선스 | 판단 |
|---|---|---|
| Ultralytics YOLO | AGPL-3.0 (파인튜닝 가중치까지 적용 범위) | ❌ MediaPipe 로 대체 |
| essentia | AGPL-3.0 | ❌ |
| aubio | GPL-3.0 | ❌ |
| madmom | BSD + 비상업/학술 제한 | ❌ librosa 로 대체 |
| Remotion | BUSL (ARR 구간별 회사 단위 유료) | ⚠️ 영상 생성이 제품 핵심이면 비용 계상 |

**렌더 스택을 Remotion·Revideo 류로 갈아탈 것인가 — 아직 아니다.** 현행 FFmpeg 파이프라인
품질이 충분하고, 애니메이션 자막은 ASS, 스티커는 알파 트랙으로 해결된다. headless Chrome 으로
옮기면 프레임당 렌더 비용·콜드스타트·폰트/GPU 이슈를 새로 떠안는다. **레이어 종류가 10개를 넘고
디자이너가 템플릿을 직접 만들어야 하는 단계**가 오면 그때 재검토한다.

**FFmpeg GPL 건**: `-c:v libx264` 를 쓰므로 Debian 기본 빌드는 GPL 일 가능성이 크다.
subprocess 호출이라 서비스 코드로 전염되지는 않지만 바이너리를 이미지에 담아 배포하므로,
Debian 소스 패키지를 가리키는 written offer + 라이선스 고지로 정리한다. `vidstab` 을 넣으면
GPL 이 더 확실해진다 — 피하려면 안정화를 포기하거나 LGPL 빌드 + libopenh264 를 검토하되
CRF 품질에서 손해를 본다.

---

## 9. 구현 순서

### 0단계 — 선행 (병행 불가)

1. **editSpec v3 설계 확정** — `layers`/`keyframes`/`audio` 핀. 여기에 §2.1 결정론이 걸려 있다
2. **`bgm_tracks` 스키마 + 음원 15~20트랙 확보** — 이게 없으면 아래가 전부 미검증 코드가 된다
3. **번인 자막 전환 결정 문서** — 소프트 자막 폐기는 FE 에 고지된 계약 변경이다(§5.1)

### 1단계 — 체감 효과 최대, 의존성 최소

4. `+faststart` · CRF · `loudnorm` · `sidechaincompress` — 반나절
5. **ASS 애니메이션 자막 + 한글 폰트** — 새 라이브러리 0, 체감 효과 1위
6. **VAD 기반 무음 자동 컷** — 이미 있는 whisper 로 가능. "AI 자동 편집"이 여기서 처음 사실이 된다
7. 비트 그리드 스냅 컷 (`snapToBeat`)

### 2단계

8. 단일 `filter_complex` 통합 (재인코딩 3회 → 1회)
9. MediaPipe 배치 + 알파 오버레이 트랙
10. `xfade` 종류 확장 + 줌 펀치 · 속도 램프

### 3단계

11. 오토리프레임 · 안정화 · NVENC

---

## 10. 테스트 계획

필터그래프 문자열 검증 14개 위에 이걸 얹으면 회귀를 잡을 수 없다. 최소 두 종류가 함께 간다.

- **ffprobe 계약 테스트**: 출력 duration 이 스펙과 ±100ms 이내, 오디오/비디오 길이 일치,
  moov 위치(faststart), 오디오 LUFS 범위
- **골든 프레임 테스트**: 5초 합성 소스에서 특정 타임코드 프레임을 뽑아 지각 해시 비교.
  자막·스티커 위치 회귀를 잡는 유일한 방법이다

⚠️ 둘 다 **CI 에 ffmpeg 설치가 필요하다.** 현행 파이썬 테스트는 "ffmpeg·SDK 없이 돈다"가
설계 원칙이라([progress.md](../progress.md)) CI 구조가 바뀐다. 기존 문자열 테스트는 그대로 두고
새 계층을 분리해 붙인다.

**비트 싱크 정확도는 자동 판정이 어렵다.** 대신 컷 시점과 최근접 비트의 오차(ms)를 로그로 남겨
분포를 본다. 사람이 어긋남을 느끼는 경계가 대략 50ms 부근이므로 이 값을 지표로 삼는다.

---

## 11. 이 계획에서 다루지 않는 것

- `Movie` 엔티티 도입 — [backlog.md](../backlog.md) A-1. 부착 지점은 §2.4 의 안건이 정한다
- 음원 조달 계약 자체 — 라이선스 **요건**만 정의한다(§7·§8)
- 앱 편집 UI — 서버가 v3 를 받을 수 있게 되는 것까지가 범위다
- GPU 렌더 인프라 — 배포 플랫폼 확정(backlog B-1) 이후 판단한다
