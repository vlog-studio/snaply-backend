# BGM 라이브러리

편집 워커는 스타일 프리셋의 태그로 이 디렉터리에서 BGM을 골라 합성한다
(`apps/ai-worker/src/pipeline/music.py`의 `pick_track`·`apply_bgm`). 프리셋 → 태그 매핑의 원천은
`apps/ai-worker/src/pipeline/editor.py`의 `PRESETS`다.

## 디렉터리 구조

태그별 하위 디렉터리에 라이선스가 정리된 음원을 넣는다.

```
apps/ai-worker/assets/bgm/
  calm/     # 프리셋 '감성'
  upbeat/   # 프리셋 '여행'
  daily/    # 프리셋 '일상'
```

- 지원 확장자: `.m4a .mp3 .aac .wav .ogg .flac` (`music.py`의 `AUDIO_EXTS`)
- 매칭: 프리셋 태그 디렉터리에서 무작위 선택 → 없으면 전체에서 선택 → 그래도 없으면 BGM 없이 진행한다.
  무작위라 같은 구성으로 다시 만들어도 BGM이 달라질 수 있다 — [backlog](../../../../docs/backlog.md) E-5.
- 위치는 `BGM_DIR`(기본 `assets/bgm`, `apps/ai-worker` 기준)로 바꿀 수 있다. 컨테이너는 Dockerfile이
  `/app/assets/bgm`으로 주입한다.

## 음원과 라이선스

- **라이선스가 클리어된 음원만** 둔다(상업적 사용 + 최종 사용자의 SNS 업로드 허용).
- 음원 파일은 git에 커밋하지 않는다(루트 `.gitignore`). 이미지는 이 디렉터리를 그대로 복사하므로
  CI가 빌드한 배포 이미지에는 이 README만 들어가고, 워커는 BGM 없이 렌더한다. 음원을 어디서
  확보할지는 결정 대기다 — [docs/decisions/bgm-sourcing.md](../../../../docs/decisions/bgm-sourcing.md) ·
  backlog A-7.
- 개발 중 파이프라인 검증에는 합성 톤(placeholder)을 쓸 수 있다 —
  `apps/ai-worker/scripts/generate-dev-bgm.sh`가 세 태그 디렉터리에 `dev_placeholder.m4a`를 만든다(FFmpeg 필요).
