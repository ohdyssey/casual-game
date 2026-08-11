# UI 하네스 — 화면 배치 기준

**이 폴더는 생성물이다. 직접 편집하지 말 것.** 배치의 원본은 UI 에디터이며,
`node "D:/Dev/phaser-ui-editor/scripts/pue.js" export` 를 실행할 때마다 이 폴더 전체가 다시 만들어진다.

게임 런타임은 이 파일들을 로드하지 않는다 — **코드를 작성할 때 참조하는 기준**일 뿐이다.

## 화면 목록

| 화면 | 이름 | 노드 | rev |
|---|---|---|---|
| `main` | 메인 화면 | 31 | `58dbea5c` |
| `blank` | 로비 | 27 | `ae6a3242` |
| `blank_2` | 결과화면 | 21 | `481558f0` |

## 좌표 규약 (반드시 읽을 것)

- `rect: [left, top, w, h]` — **좌상단 기준**. `center: [cx, cy]` 도 함께 제공
- 디자인 기준 해상도는 각 json 의 `frame` — 실제 캔버스 크기와 다를 수 있다
- `z` 는 높을수록 위. `nodes` 는 z 오름차순(뒤→앞)으로 정렬돼 있다
- `space`: `screen`(화면 고정) · `world`(카메라 추종) · `auto`(미지정)
- `pin`: 캔버스 크기가 다를 때 붙을 가장자리 (`none` = 반응형 규칙 없음)
- **텍스트**: `rect` 는 근사값이다. 배치의 진실은 `at`(기준점) + `anchorX`/`anchorY`(그 기준점이 박스의 어디인지)

### 어휘 정의

| 필드 | 값 | 의미 |
|---|---|---|
| `anchorX` | `left` \| `center` \| `right` | `at` 이 텍스트 박스의 가로 어디인지 |
| `anchorX` | `center(box)` | `wrapW` 가 있는 텍스트. 원점은 박스 중앙이고, 줄 정렬은 `style.align` 이 따로 담당 |
| `anchorY` | `top` \| `middle` \| `bottom` | `at` 이 세로 어디인지 |
| `style.wrapW` | px | 줄바꿈 폭. 이 폭에서 워드랩 |
| `style.wrapH` | px | 정렬 기준 **박스 높이**. 클리핑이 아니다. 미지원이면 무시해도 배치는 맞다 |
| `style.alpha` | 0~1 | 노드 전체 투명도 |
| `style.fillAlpha` | 0~1 | 채움색만의 투명도. **최종 = alpha × fillAlpha** (외곽선은 alpha 만 받음) |
| `style.radius` | px | 둥근 모서리. Phaser `add.rectangle` 은 지원하지 않으므로 `Graphics.fillRoundedRect` 를 쓸 것 |
| `space: "auto"` | — | 반응형 규약 미지정. **디자인 좌표 그대로** 배치하면 된다 |
| `points` | `[[x,y],…]` | 다각형·동선의 실제 꼭지점(디자인 절대좌표). `rect` 는 경계상자일 뿐 |
| `curve` / `tension` | `catmull-rom` / 0~1 | `points` 를 잇는 곡선 방식 (동선) |
| `closed` | bool | 마지막 점과 첫 점을 잇는지 |
| `decorative` | `baked-shadow` | 본체의 그림자 복제본. 독립 요소가 아니다 |

### ⚠ `hints` — 추정이지 확정이 아니다

저작자가 역할을 지정하지 않은 화면에는 `spec.hints.interactiveCandidates` 가 실린다.
하네스가 **에셋 키 계열 · 라벨의 뜻 · 인접 캡션 · 아이콘 격자 패턴**으로 유추한 버튼 후보이며,
각 항목에 `confidence` 와 `evidence`(근거)가 붙는다.

- 이걸 근거로 구현해도 좋다. 다만 **코드에 `TODO` 를 남겨** 사람이 확인하게 하라
- `conflicted: true` = 신호가 엇갈림(예: 이름은 "구입"인데 에셋은 배경 계열) — 특히 확인 필요
- 저작된 `interactive`/`action` 이 있으면 **언제나 그쪽이 우선**한다 (추정은 저작을 덮지 않는다)
- 후보가 부정확하면 사용자에게 **에디터에서 「버튼」과 역할을 지정**하라고 알려라

## 의미 정보

- `interactive` / `action` — 탭 대상 (`role: "action:xxx"` 에서 유도)
- `field` — 데이터 표시 자리 (`role: "field:xxx"` 에서 유도)
- `binding` — 런타임 값으로 교체할 키. `text` 는 디자인용 예시값
- `freedom` — `locked`(고정) · `constrained`(범위 내 자유) · `delegated`(AI가 결정).
  필드가 없으면 전부 `locked`

## 변경 확인

```
node "D:/Dev/phaser-ui-editor/scripts/pue.js" check     # 마지막 반영 이후 바뀐 화면과 그 diff
node "D:/Dev/phaser-ui-editor/scripts/pue.js" sync      # 현재 상태를 "반영 완료"로 도장
```

생성 시각: 2026-08-04T08:23:07.874Z · 하네스 v1
