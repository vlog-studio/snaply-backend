# UX writing rules

Product copy is Korean, in 해요체. Code identifiers, file paths, log output, and this documentation are English. Copy is part of the interface, not decoration on top of it: most hierarchy and predictability problems are cheaper to fix in words than in layout.

## Foundation

Toss publishes eight writing principles ([source](https://toss.tech/article/8-writing-principles-of-toss)). They are adopted here as `Toss Principle` and restated as checks:

| Toss principle | Check applied here |
| --- | --- |
| Predictable hint | Does the copy let the user predict the next screen? |
| Weed cutting | Is every word load-bearing? |
| Remove empty sentences | Does any sentence repeat what another already said? |
| Focus on the key message | Is only what matters *now* being said? |
| Easy to speak | Does it sound like a person talking, read aloud? |
| Suggest over force | Does it coerce, or use fear? |
| Universal words | Would every user, at any age, understand it and be unharmed by it? |
| Find hidden emotion | Does it acknowledge how the user feels at this moment? |

Toss's published guidance for apps inside Toss adds: 해요체 throughout, active voice over passive, positive phrasing (`할 수 있어요` over `안 돼요`), casual politeness without heavy honorifics (`~시`, `~께`), and verb forms instead of stacked nouns ([source](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide)).

Project addition (`Derived Principle`): **no explanatory UI copy.** Screens do not narrate themselves. Delete the sentence and strengthen the label, the state read-out, or the structure instead.

---

## CTA

**Rule.** A CTA names the outcome the user gets, as a verb phrase in their words.

| Bad | Better | Why |
| --- | --- | --- |
| 확인 | 알림 받기 | Names the result, so the tap is predictable |
| 완료 | 이 스냅으로 새 무비 | Says what completing produces |
| 계속 | 만들기 시작하기 | Removes "continue to *what*?" |
| 제출 | 가입하고 시작하기 | Outcome, not mechanism |
| 설정 저장 | 알림 켜기 | Describes the effect, not the persistence |
| 선택 완료 | 이 무비에 넣기 | Names the destination the selection is headed for |
| 삭제 | 스냅 3개 삭제 | Names what is destroyed |

**Construction.** `[object] + [verb]`, imperative-neutral form (`-기` or `-하기`). Include a count when the action operates on a selection. Keep it short enough to fit one line at the largest supported font scale — shorten the phrase, never its meaning; the full phrase belongs in the accessibility label.

**Pairing.** Both halves of a question are outcome-named: `알림 받기` / `안 받기`. Not `예` / `아니오`. Not `확인` / `취소`.

**Allowed generic labels.**
- `다음` in an honestly linear, announced sequence.
- `닫기`, `취소`, `나중에`, `괜찮아요` — dismissals are already outcomes.
- `확인` for a pure acknowledgement where nothing changes and no choice exists.
- OS-owned buttons we do not control; then the preceding screen carries the prediction.

**Never.** A CTA that describes UI state (`토글 켜기`), an internal action (`동기화`), or a promise the screen cannot keep.

---

## Questions

**Rule.** Ask about a fact the user already holds. If the answer does not come within about three seconds, the question is wrong — restate it, or answer it yourself with a visible default ([`Easy to Answer`](principles.md#2--easy-to-answer)).

| Bad | Better | What changed |
| --- | --- | --- |
| 어떤 알림 전략을 사용하시겠어요? | 이 장소 근처에 오면 알려드릴까요? | System concept → the user's own situation |
| 생성 모드를 선택하세요 | 무비를 몇 초로 만들까요? | Pipeline choice → a length the user wants |
| 동기화 방식을 고르세요 | 와이파이에서만 올릴까요? | Internal mechanism → a condition the user knows |
| 정렬 기준을 설정하세요 | 최신순으로 볼까요? | Configuration → an outcome |
| 이 스냅들로 무비를 만드시겠습니까? | 이 스냅으로 새 무비 | A question that did not need asking → direct action |

**Shape.** One line. One question. `~할까요?` / `~있나요?`. Options that are results, ordered by likelihood, and mutually exclusive. Never a question whose options a user must compare on more than one dimension at once.

**Do not ask** what the system knows (location just recorded, a preference already set), what product policy decides, or what has one overwhelmingly common and reversible answer — default it visibly instead.

---

## Explanations

**Rule.** Lead with what the user gets, not how the feature works. Then stop.

| Bad | Better |
| --- | --- |
| AI 모델이 스냅을 분석해 자동으로 편집 구간을 결정합니다 | 찍은 스냅으로 짧은 영상을 만들어요 |
| 백그라운드 업로드 큐가 처리 중입니다 | 스냅 2개 올리는 중 |
| Geofence가 등록되었습니다 | 이 장소 근처에 오면 알려드려요 |

**Length.** One line. If two lines are needed, the structure is probably wrong — check whether a label, a count, or an ordering change removes the need for the sentence.

**Placement.** Explanation goes where the decision is made, not in a header. Detail beyond one line goes behind one disclosure or into the accessibility hint.

**Prohibited shapes.** Feature tours in prose; empty-state paragraphs; sentences that teach the UI (`아래 버튼을 눌러 시작하세요`); marketing adjectives (`혁신적인`, `완벽한`); exclamation-driven urgency; anything that stacks nouns instead of using a verb (`무비 생성 진행 상태 확인` → `만드는 중이에요`).

---

## State read-outs

The replacement for explanation. A read-out is a short labeled fact that makes the next action self-evident.

| Situation | Read-out |
| --- | --- |
| A movie's cut list | `컷 6 · 0:14` |
| The library's holdings | `18개 · 0:23` |
| Upload in progress | `2개 올리는 중` |
| Offline queue | `연결되면 올라가요` |
| Generation running | `만드는 중 · 1분 정도 걸려요` |
| Template match | `4칸 중 3칸 채웠어요` |

**Form.** `[object] [number]`, or `[verb]-는 중`. Present tense. No terminal punctuation. Numerals as digits. Units in Korean (`초`, `분`, `개`). Never a percentage the user cannot act on.

---

## Errors

Follows Toss's six error principles ([source](https://toss.tech/article/21021)). Structure: **state → fix.** Two sentences maximum, one preferred.

| Bad | Better |
| --- | --- |
| 오류가 발생했습니다 (code 500) | 무비를 만들지 못했어요 + `다시 시도` |
| 잘못 입력했습니다 | 이메일 주소를 확인해 주세요 |
| 네트워크 오류 | 인터넷 연결이 불안정해요 + `다시 시도` |
| 권한이 거부되었습니다 | 카메라를 쓸 수 없어요 + `설정에서 권한 켜기` |
| 업로드 실패 (retry 3/3) | 스냅을 올리지 못했어요 + `다시 올리기` |

**Rules.** Never blame the user (no `잘못`, `실패하셨습니다`). Never lead with a code. Never end without an action, unless nothing can be done — then say what happens next (`연결되면 다시 올려요`). Do not invent a cause you cannot verify; `무비를 만들지 못했어요` is honest, a fabricated reason is not.

---

## Empty states

One short line of state, plus the action that fills it. Nothing else.

| Surface | Copy |
| --- | --- |
| No snaps yet | `아직 스냅이 없어요` + `첫 스냅 찍기` |
| No filter results | `조건에 맞는 스냅이 없어요` + `필터 지우기` |
| No movies | `아직 무비가 없어요` + `이 스냅으로 새 무비` |
| Load failed | `불러오지 못했어요` + `다시 시도` |

Distinguish the three kinds — nothing yet, nothing matched, failed to load. One shared "empty" string for all three is a bug.

---

## Terminology

Fixed product vocabulary. Use exactly these words; never introduce a synonym.

| Term | Means | Never |
| --- | --- | --- |
| 스냅 | One short recorded or extracted clip | 클립, 영상, 필름, 사진 |
| 무비 | One generated video, or the draft collecting toward it | 비디오, 결과물, 프로젝트 |
| 컷 | One snap inside a movie | 장면, 조각 |
| 스튜디오 | The tab where a movie is started | 홈, 메인 |
| 가져오기 | Importing from the gallery | 업로드, 임포트 |

`트레이` left the vocabulary with the tray's removal (2026-08-12): picks now go straight into a movie (`이 스냅으로 새 무비`, `스냅 더 넣기`), and no surface may name a destination other than a movie. Do not reintroduce it.

`담기` / `담김` stayed, because it names the **act** of taking a snap and the confirmation that one was taken, which no other word covers: the shutter's `꾹 눌러 담기` and `다시 담기`, the `담김 · 스냅 N개` badge after a capture or an extraction, and the picker cell's `담김` badge for a snap the target movie already holds. Use it for the act and its confirmation only — never for a place things are collected into, which is what the tray was.

Internal vocabulary that must never appear on screen: queue, job, sync, geofence, model, generation id, error codes, enum values, route names.

When a new concept needs a name: pick a Korean word a first-time user would use, add it to this table, and use it in every surface at once. Renaming later costs more than naming carefully now.

---

## Tone

- 해요체 everywhere, including errors and system-initiated messages.
- Active and positive: `와이파이에서만 올려요` over `모바일 데이터로는 올릴 수 없습니다`.
- Calm, not cute. No exclamation marks except in genuine celebration, and at most one per screen.
- No urgency pressure, no fear, no dark-pattern framing of the decline option (`Suggest over force`).
- Acknowledge the moment where it is real (a failed generation after a long wait), briefly — one clause, not a paragraph.

---

## Pre-merge copy checklist

- [ ] Every CTA names its outcome, or is a justified generic exception.
- [ ] Every question is answerable in ~3 seconds from facts the user holds.
- [ ] No sentence teaches the UI; state read-outs carry the meaning instead.
- [ ] No internal vocabulary, codes, IDs, or enum values are visible.
- [ ] Every error has a state and a fix, and blames no one.
- [ ] Empty states distinguish nothing-yet / nothing-matched / failed.
- [ ] Terminology matches the table above exactly.
- [ ] Every string is 해요체, active, and positive.
- [ ] Labels fit one line at the largest supported font scale; accessibility labels carry the full phrase.
- [ ] Read aloud: it sounds like a person, not a system.
