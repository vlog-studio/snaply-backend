# 스냅 내용 분석 스파이크

> **작성일**: 2026-08-19
> **상태**: 스파이크 하네스 (프로덕션 경로가 아니다)
> **결정·범위**: [docs/decisions/snap-content-analysis.md](../../../../docs/decisions/snap-content-analysis.md)
> **본구현 제안**: [docs/plans/video-analysis-implementation-plan.md](../../../../docs/plans/video-analysis-implementation-plan.md)

목적은 기능 출시가 아니라 **기준선 확보**다 — 분석 품질, 스냅당 처리시간, 입출력 토큰,
**스냅당 단가**, 호출 실패율. 이 값들이 없으면 백로그 A-3의 "비용 한도"와 "운영 모델 고정"을
정할 수 없다.

## 이 디렉터리가 건드리지 않는 것

결정 문서 §5.2에 따라 **프로덕션 경로를 만들지 않는다.**

- Prisma 모델·마이그레이션 없음 (`VideoAnalysis` 는 본구현 단계)
- API 라우트·shared types·BullMQ 큐 없음
- `apps/api/src/env-spec.ts`·`.env.example` 에 변수 선언 없음 —
  `OPENAI_API_KEY` 는 **셸 환경에서만** 읽는다
- 프로덕션 워커 의존성(`../../requirements.txt`) 변경 없음 — 스파이크 의존성은 이 디렉터리의
  `requirements.txt` 에 따로 둔다

## 준비

```bash
# 1) 워커 venv (없으면)
npm run worker:install

# 2) 스파이크 전용 의존성
apps/ai-worker/.venv/bin/pip install -r apps/ai-worker/scripts/analysis-spike/requirements.txt

# 3) 단가 표 — 모델 제공자의 공식 가격표를 보고 직접 채운다 (비우면 비용 집계 제외)
cp apps/ai-worker/scripts/analysis-spike/models.example.json \
   apps/ai-worker/scripts/analysis-spike/models.json
```

FFmpeg/FFprobe가 PATH에 있어야 한다(편집 워커와 같은 요구사항).

평가셋은 **팀원 폰으로 직접 촬영한 3초 내외 세로 영상 30~100편**을 `samples/` 에 둔다.
사용자 스냅을 쓰지 않는다 — 외부 모델로 프레임이 나가는 처리라 약관·고지가 선행돼야 한다
(결정 문서 §6). 계획 문서 §14.4의 카테고리를 의도적으로 채운다: 풍경 · 음식 · 셀카 ·
반려동물 · 빠른 움직임 · 야간 · 역광 · 흔들림 · 초점 불량 · 거의 동일한 프레임 ·
중간에 화면이 바뀜.

`samples/`, `out/`, `models.json` 은 `.gitignore` 에 있다.

## 실행

```bash
cd apps/ai-worker/scripts/analysis-spike

# 프레임 추출까지만 확인 (모델 호출 없음 = 비용 0)
../../.venv/bin/python run_spike.py --videos ./samples --models m1 --dry-run

# 실제 비교 — 모델 2개 × 프레임 4장 · detail low (변수는 모델 하나로 제한한다)
export OPENAI_API_KEY=...   # 셸 환경에만 둔다
../../.venv/bin/python run_spike.py \
  --videos ./samples \
  --models gpt-5.6-luna,gpt-5.6-terra \
  --out ./out
```

추론 파라미터를 지원하지 않는 모델은 `--reasoning-effort ""` 로 끈다.

## 산출물

| 파일 | 내용 |
|---|---|
| `out/results.jsonl` | 영상 × 모델 1행. 실측 길이, 사용한 프레임 시점, 지연시간, 토큰, 단가, 결과 또는 오류 코드 |
| `out/summary.json` | 모델별 성공률 · 지연 p50/p95 · 평균 토큰 · **스냅당 단가** · `usableForEdit` 비율 · 오류 코드 분포 |
| `out/labels.csv` | 사람이 채점할 시트. 모델 출력이 채워져 있고 채점 열은 비어 있다 |

`summary.json` 의 `meanFrameCount` 가 4에서 크게 내려가 있으면 유사 프레임 제거가 과하게
걷어낸 것이다 — `frame_sampler.DUPLICATE_HAMMING_THRESHOLD` 를 의심한다.

품질 지표는 자동으로 나오지 않는다. `labels.csv` 의 채점 열을 채운 뒤:

```bash
../../.venv/bin/python score_spike.py --labels ./out/labels.csv
```

| 채점 열 | 의미 |
|---|---|
| `summary_factual` | 요약이 사실인가 (1/0) |
| `objects_expected` / `objects_missed` | 핵심 사물 수와 그중 놓친 수 → 포함률 |
| `actions_correct` | 주요 행동을 맞혔는가 (1/0) |
| `hallucinated` | 없는 내용을 만들었는가 (1/0) |
| `usable_correct` | `usableForEdit` 판단이 맞는가 (1/0) |

빈 칸은 **채점하지 않은 행**으로 보고 제외한다. 0으로 세면 덜 채점한 만큼 품질이 나빠 보인다.

## 구성

| 파일 | 역할 |
|---|---|
| `frame_sampler.py` | FFprobe 실측 길이 → 상대 위치 시점 계산, 한 번의 ffmpeg 호출로 추출, 평균 해시로 유사 프레임 제거 |
| `prompt.py` | 프롬프트와 `PROMPT_VERSION`, 허용 `visualIssues` 코드 |
| `result_schema.py` | Structured Outputs 용 JSON Schema + 애플리케이션 재검증 |
| `vision_client.py` | 요청 구성(프레임 전체를 한 요청), 오류 분류, 단가 계산 |
| `report.py` | 모델별 집계, 라벨 시트 생성, 채점 집계 |
| `run_spike.py` · `score_spike.py` | CLI |

계산 로직은 외부 호출과 분리해 두었고 테스트는 ffmpeg·SDK 없이 돈다.

```bash
cd apps/ai-worker && python3 -m unittest tests.test_analysis_spike
```

## 스파이크가 끝나면

기준선을 [docs/progress.md](../../../../docs/progress.md)에 기록하고,
백로그 A-3의 후속 결정(운영 모델 고정 · 스냅당 단가 상한 · 프레임 수·detail 재탐색 여부 ·
본구현 승인)을 닫는다. 본구현으로 넘어가면 이 디렉터리는 남기지 않고 정리한다.
