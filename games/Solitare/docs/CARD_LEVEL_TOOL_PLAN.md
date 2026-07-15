# 카드 레벨 설계 툴 (Card Level Tool) 설계 문서

> 범용 카드 배치 레벨 저작 도구. 기준 게임 = 이 프로젝트 `Solitare` (TriPeaks 변형 "Solitaire Heights").
> 목표: **기본 보드 배치 "양식(template)" 몇 개를 디자인 → 각 레벨에 적용/응용**하여 대량 레벨을 저작.
>
> **저장소 구분**: 이 문서와 데이터(`public/ui/card-levels/`)는 게임 프로젝트(Solitare)에 있고, **툴 코드는 에디터 저장소 `phaser-ui-editor`**(`src/card/*`, `src/editor/CardLevelScene.js`)에 구현된다. 아래 코드 경로(`src/...`)는 에디터 저장소 기준.

## 0. 확정된 설계 축 (4대 결정)

| 축 | 결정 | 의미 |
|----|------|------|
| **범위** | 범용 카드코어 **선설계** | pile(tableau/foundation/stock/waste) + occlusion(가림)을 처음부터 통합 모델링. TriPeaks/Klondike/FreeCell/마작솔리테어를 하나의 코어로 커버 |
| **게임 연동** | 저작 + 미리보기 **만** (지금은) | 게임(levels.ts)은 절차생성 유지. 툴은 저작 + PlayScene 지오메트리를 복제한 WYSIWYG 미리보기까지. JSON 소비는 이후 단계 |
| **에디터 배치** | 신규 **'카드레벨' 모드** | `createCardLevelScene(cfg)` 전용 씬(ParticleEditorScene 모델). render/block/registry 인프라는 재사용 |
| **양식 적용** | **하이브리드** (수동 배치 主 + 자동 패킹 補) | **1차 = 직접 배치**(오픈/폴드 브러시로 레이어를 쌓듯 툭툭 놓아 배열 설계). 자동 패킹은 시작점/보조 |

### 0.1 편집 무게중심 (핵심 재확인)

> 원하는 편집 방식 = **카드 배치·배열만** 정하는 수제 저작. 카드 값/아트는 편집 대상 아님.
>
> 1. **오픈 카드 / 폴드 카드** 중 브러시를 선택 → 캔버스에 **레이어를 쌓듯** 카드를 툭툭 배치.
> 2. **겹침 + 레이어 순서**가 곧 가림(cover) 관계 = 난이도. (격자 공식이 아니라 **놓은 그대로**)
> 3. 순서: **레벨 지정 → 보드카드 N장 + 스택카드 M장 예산 결정 → 보드 배열 설계**.
> 4. **양식** = 이렇게 손으로 만든 배열을 저장해 다른 레벨에 적용/변주하는 것.
> 5. **제공+규모**: 나(툴)가 다양한 배치를 **템플릿으로 대량 제공**(§5), 그 템플릿을 **변주해 ~1,000 레벨을 생성**하는 구조(§6)를 얹는다.
>
> → 구분: **저작 메타포 = 손 배치**(변하지 않음). **파라메트릭 "자동 배치 생성기"는 편집 도구가 아님**(강등). 단 §6 생성기는 *손으로 만든 템플릿을 변주*해 규모를 내는 것 = 저작이 아니라 **증식**. 어떤 생성 레벨도 열어 손으로 override 가능.

---

## 1. 배경 — 현재 상태와 빈 공간

### 1.1 Solitare 게임의 실체 (조사 결과)

- **변형**: TriPeaks (rank ±1, A↔K wrap). Klondike/Spider/FreeCell 아님.
- **보드 모델** = `src/logic/layouts.ts`의 순수 데이터:
  ```ts
  interface LayoutSlot {
    id; row: number; col: number;        // col = HALF-COLUMN(0.5 단위)
    coveredBy: string[];                 // ★ 가림 그래프 = 난이도의 전부
    kind?: 'front'|'back'; fan?: -1|0|1; group?: number;
  }
  interface PeakLayout { id; rowCount; slots: LayoutSlot[]; order: string[]; }
  ```
  핵심 규칙: 슬롯 `c`는 다음 행의 `c-0.5`, `c+0.5`에 의해 가려짐(`EPS=0.01`). 이 한 규칙이 모든 peak/pyramid 형태를 생성.
- **빌더**: `buildPeakLayout`(하행이 상행 가림, base 먼저 노출) / `buildCascade`(상행이 하행 가림) / `buildClusterLayout`(독립 미니 클러스터 다중 배치 — **실제 레벨이 쓰는 것**) / `buildFannedGrid`.
- **레벨** = `src/logic/levels.ts`, **100% 코드 절차생성**:
  - shape 라이브러리 `S`: `pyr3, pyr6, pyr10, w6(twin), trap9`.
  - `cardsForLevel(lv) = clamp(18 + (lv-1)*3, 18, 36)` → `pickShapes` → `packRows`(대칭 클러스터 배치) → `buildClusterLayout`.
  - 60레벨 순환 + 5 floor 테마.
  - `dealWinnable(layout, rng)`: DFS 솔버(`isWinnable`)로 **승리보장 딜**까지 리셔플.
- **좌표→픽셀**은 씬에서만 (`PlayScene.slotPos`): 카드 `132×181`, 프레임 `1080×2400`, 보드 rect `x:55–1025 y:680–1850`, `pxUnit≈136 pyUnit≈105`, stock/waste 하드코딩.
- **에디터 연동**: `phaser-ui-editor.project.js` 계약 존재, `public/ui/layouts/{main,home}.json`. 그러나 **카드 배치는 저작하지 않음** — main.json은 배경/HUD chrome 전용, `"nodes":[]`. → **여기가 빈 공간.**

### 1.2 에디터의 재사용 자산 (조사 결과)

| 자산 | 위치 | 카드툴에서의 용도 |
|------|------|------------------|
| 모드 등록 패턴 | `editor-app/boot.js`(씬 배열+`mountModeTabs`) + `mode-tabs.js`(`MODES`/`BARS`/`__pueSwitchMode`) | 신규 카드레벨 모드 등록 |
| 가장 얇은 씬 모델 | `src/editor/ParticleEditorScene.js`(~23KB), `StoryEditorScene.js`(~31KB) | CardLevelScene 골격 참조 (UiEditorScene 390KB는 부적합) |
| 스키마 코어 | `src/schema/layoutSchema.js`(`coerceLayout`) | cardBoardSchema를 병렬로 신설, 같은 coerce 패턴 |
| 반복 렌더 | `renderLayoutInto.js`의 `repeater` 노드 + `registerNodeRenderer(type, fn)` | 카드 슬롯 프리뷰 렌더러 등록 |
| 그리드 빌더 | `screenLibrary/primitives.js` `m.grid(...)` | 격자형 슬롯 프리뷰 |
| 스테이지 레벨 | `src/render/nodeLevels.js` (`layout.levels{count,current}`, `computeLevelSuppression`) | **패턴만 참고**(카드 레벨은 "같은 보드의 tier"가 아니라 "다른 보드"라 구조는 별도) |
| 블록 라이브러리 | `blockLibrary.js` + `blockCapture/blockInstantiate`(keyMap) | 커스텀 양식을 블록으로 저장→프로젝트 간 재사용 |
| 레지스트리 저장 | `/__ui_layout`, `/__ui_layouts`, `.pue/current.json` 프로젝트 포인터 | 카드 보드/레벨 인덱스 저장 |

---

## 2. 범용 카드코어 데이터 모델

> 원칙: **모든 것은 slot이고, slot은 pile에 속한다.** 가림은 `coveredBy`로 표현하면 TriPeaks(격자)·마작(3D)·pile-cascade(순차)를 모두 커버.

### 2.1 CardBoard (저작 산출물 = 레이아웃 파일 1개)

```jsonc
{
  "schemaVersion": 1,
  "kind": "cardBoard",              // UI 레이아웃과 구분
  "frame": { "designW": 1080, "designH": 2400 },         // 세로 기본(게임 실제 방향), 카드 132×182
  "playZone": { "x0": 54, "y0": 600, "x1": 1026, "y1": 1920 }, // ★ 배치 허용 영역 = 화면 가운데 밴드(상단 상점·하단 뽑기 제외). 저작 시 이 안에만 배치
  "grid": { "unitX": 132, "unitY": 52, "half": true },   // 프리뷰 픽셀 단위(PlayScene.slotPos와 동일)
  "deck": { "type": "standard52", "packs": 1 },          // standard52 | double | mahjong144 | custom
  "piles": [ /* Pile[] */ ],
  "slots": [ /* Slot[] */ ],
  "templateRefs": [ /* 어떤 양식을 스탬프했는지 (재편집/재패킹용) */ ]
}
```

### 2.2 Pile — 카드 컨테이너

```jsonc
{
  "id": "board",
  "name": "메인 보드",
  "kind": "peak",                   // board|peak|pyramid|tableau|foundation|stock|waste|freecell|reserve
  "arrange": "occlusion",           // occlusion|fan-down|fan-right|stack|single
  "anchor": { "row": 0, "col": 0 }, // pile 원점 (pile기반 게임의 배치 핸들)
  "fan": { "x": 0, "y": 0.28 },     // cascade fan 오프셋(unit)
  "deal": { "count": 0, "faceUp": "exposed" }  // 초기 딜 장수 / faceUp 정책: n | 'lastN' | 'all' | 'exposed'
}
```

- `arrange`가 pile 카드의 배치 정책을 결정 → 게임별 차이를 pile 속성으로 흡수:
  - `occlusion`: 슬롯이 명시 좌표+coveredBy (TriPeaks/Pyramid/마작)
  - `fan-down`/`fan-right`: cascade(Klondike/FreeCell tableau) — 각 카드가 이전 카드를 순차 가림
  - `stack`: 겹쳐쌓기(stock/foundation)
  - `single`: 1장 슬롯(FreeCell 셀, waste)

### 2.3 Slot — 카드 자리

```jsonc
{
  "id": "s07",                      // 배치 순서로 자동 부여
  "pile": "board",
  "x": 540, "y": 820,               // ★ 놓은 자리 (자유 좌표, 스냅 옵션)
  "layer": 2,                       // ★ 쌓은 층 (나중에 놓을수록 높음 = 위)
  "face": "open",                   // ★ 브러시로 지정: open(오픈) | fold(폴드)
  "coveredBy": ["s03","s04"],       // 겹침×레이어에서 자동유도 (수동 override 가능)
  "group": 0                        // 렌더 힌트(fan 그룹, 선택)
}
```

- **슬롯은 "놓은 카드" 그 자체.** `(x,y)` = 놓은 자리, `layer` = 쌓은 층, `face` = 브러시(open/fold).
- **`coveredBy`는 저작하지 않고 유도됨**: 카드 B가 A보다 높은 `layer`이고 사각형이 임계 이상 겹치면 → B가 A를 가림. (§2.5)
- half-column 격자(`row/col`)는 **스냅 보조**일 뿐 — 원하면 `x,y`를 격자에 스냅해 TriPeaks식 깔끔한 봉우리를 만들지만, 근본 모델은 자유 배치.
- pile-cascade 게임은 pile의 fan 정책으로 `x,y`/`layer`를 자동 계산 가능(수동 배치와 동일 결과 구조).

### 2.5 가림(cover) 유도 — 격자 공식이 아니라 "놓은 그대로"

```
coverGraph(slots):
  for A, B in slots (A ≠ B):
    if B.layer > A.layer and overlapArea(A, B) ≥ OVERLAP_MIN:
        A.coveredBy += B          // 위에 겹쳐 놓인 B가 A를 가림
  open  = 위에 아무도 안 겹친 카드 (플레이 시작 시 노출)
  fold  = 하나라도 위에 겹친 카드 (걷어내면 노출)
```

- 이것이 **"레이어를 쌓듯 배치 = 가림 = 난이도"** 를 실현하는 코어. 격자 EPS 규칙(게임 `layouts.ts`)은 **스냅 배치 시의 특수 케이스**로 흡수(정확히 반칸이면 반칸 이웃이 덮음).
- `face` 브러시는 초기 표시상태를 명시 지정(오픈/폴드). 툴은 "최상단 미겹침=open" 을 기본 추천하되 브러시가 우선.

### 2.4 범용성 증명 — 하나의 코어, 여러 게임

| 게임 | deck | piles | arrange | cover |
|------|------|-------|---------|-------|
| **TriPeaks (Solitare)** | standard52 | board(peak)+stock+waste | occlusion | 격자 half-col, 하행이 상행 가림 |
| Pyramid | standard52 | board(pyramid)+stock+waste | occlusion | 격자, top 노출 |
| Klondike | standard52 | 7×tableau + 4×foundation + stock + waste | fan-down / stack | pile 내 순차 |
| FreeCell | standard52 | 8×cascade + 4×free + 4×foundation | fan-down / single | 순차 |
| 마작 솔리테어 | mahjong144 | board | occlusion(3D) | layer + 좌/우 |
| 매치 그리드 | custom | board(grid) | grid | 없음 |

→ 코어는 **{deck, piles, slots, coverGraph}** 4요소로 위 전부 표현. TriPeaks를 첫 구현 대상으로 하되 스키마는 확장 여지를 확보.

---

## 3. 편집 워크플로우 & 양식 — 요청의 핵심

> **핵심 원칙: 양식을 미리 정의하지 않는다. 수동 배치가 곧 양식을 만드는 행위다.**
> 템플릿은 파라미터 생성기가 아니라 **손으로 놓은 배열의 저장본**. 파라메트릭 자동생성은 존재하지 않아도 되며(§7 P3 선택), 주 편집 루프는 처음부터 끝까지 손 배치다.

### 3.1 워크플로우 (편집 순서)

```
① 레벨 지정        L12 선택 (또는 새 레벨)
        │
② 카드 예산 결정    보드카드 N장 + 스택카드 M장   ← 배치 전에 먼저 정함
        │           (툴이 "보드 0/N, 스택 M, 덱 잔여" 예산 HUD 표시)
        │
③ 보드 배열 설계    오픈/폴드 브러시 선택 → 캔버스에 레이어 쌓듯 툭툭 배치
        │           놓을 때마다 예산 카운터 감소, 겹침→coverGraph 실시간 유도
        │
④ 검증             승리가능성 검사(solvable DFS) + 오픈 카드 존재 확인
        │
⑤ (선택) 양식 저장  완성한 배열을 "양식"으로 저장 → 다른 레벨에 적용/변주
```

- **②를 먼저** 하는 이유: 예산이 배치의 제약이자 목표. "보드 18장 / 스택 24장" 을 정하면 툴이 남은 장수를 실시간 안내 → 딜 정합성(덱 초과 방지)이 저작 중 보장.

### 3.2 수동 배치가 곧 양식을 만든다 (주 편집 루프)

- **브러시 2종**: `오픈(open)` / `폴드(fold)`. 선택 후 캔버스 클릭 = 그 face의 카드 슬롯 1장 배치.
- **레이어 쌓기**: 새로 놓는 카드는 기본 `layer = 현재최고+1`(위에 얹힘). 겹쳐 놓으면 아래 카드를 가림 → 아래 카드는 자동으로 폴드 취급(§2.5). 층 수동 조정(↑/↓)도 가능.
- **배열이 전부**: 카드 값·수트·아트는 편집하지 않음(딜 시 게임이 덱에서 배정). 저작 대상 = **어디에·몇 층으로·어떤 face로** 놓느냐.
- **결과물** = §2.1 CardBoard 그대로. "양식"이라는 별도 생성 스펙이 없음 — **배열 자체가 산출물**.

### 3.3 양식 = 수제 배열의 저장·재사용

- 완성한(또는 부분) 배열을 **양식으로 저장** = 그 시점의 `{piles, slots}` 스냅샷을 이름 붙여 보관.
  ```jsonc
  { "id": "my-twin-fan", "name": "내 쌍봉 팬",
    "source": "hand",              // 항상 hand (수제). 파라메트릭 생성기 아님
    "board": { "piles":[…], "slots":[…] },   // 놓은 그대로의 배열
    "budget": { "board": 24, "stock": 20 } }  // 만들 때의 예산(기본 제안값)
  ```
- 재사용: 다른 레벨에서 양식을 **스탬프**(그대로 붙여넣기) → 이후 손으로 변주(카드 추가/삭제/이동/층조정). 스탬프는 블록 라이브러리 `instantiateBlock` 재사용.
- **기본 제공 양식은 코드가 아니라 "예시 프로젝트에 저장된 수제 배열"** 로 배포(3-Peak, 쌍봉, 피라미드 등). 사용자가 열어보고 변형·삭제 자유. → 미리 박제된 파라미터가 없음.

### 3.4 레벨 모델

```jsonc
{
  "id": "level-012", "index": 12, "name": "12층", "theme": "coffee",
  "budget": { "board": 27, "stock": 24 },   // ★ ② 단계에서 먼저 정한 예산
  "boardRef": "level-012.board.json",        // 손 배치 배열(또는 스탬프한 양식+변주)
  "deck": { "type": "standard52" },
  "deal": { "faceByLayout": true },          // face는 슬롯의 open/fold + coverGraph에서
  "objectives": ["clear-board"],             // clear-board | clear-in-N-moves | collect-suit …
  "seedPolicy": "winnable"                    // winnable | fixed:<seed> | random
}
```

- 레벨은 **하나의 손 배치 배열(boardRef)** 을 가리킴. 배열은 §2.1 CardBoard 파일.
- 양식을 스탬프해 시작했든 백지에서 놓았든, 저장되는 것은 동일한 CardBoard(놓은 그대로).

### 3.5 해석 파이프라인 (resolve)

```
board 파일(손 배치 slots)  ──▶  coverGraph 유도(겹침×레이어, §2.5)
        │                           open/fold 확정
        ▼
  concrete CardBoard  ──▶  (프리뷰) geom.slotPos 로 렌더 = 게임과 픽셀 동일
                          (검증) solvable DFS로 승리가능 확인
                          (딜)   보드 slots에 덱 배정 + 잔여 = stock (budget.stock)
```

→ **"기본 배치 양식 몇 개를 손으로 디자인 → 각 레벨에 적용·응용"** 이 그대로 구현됨. 양식은 손에서 태어나고, 레벨은 그것을 스탬프+변주.

---

## 4. 에디터 UI — 카드레벨 모드

`createCardLevelScene(cfg)` — ParticleEditorScene 골격. **손 배치가 주 편집 루프**이므로 UI 중심은 브러시 + 예산 HUD + 캔버스.

```
┌──────────────┬─────────────────────────────────┬──────────────┐
│  좌측 패널   │        중앙 보드 캔버스         │  인스펙터    │
│              │                                 │              │
│ [레벨 목록]  │  예산 HUD: 보드 12/27 · 스택 24 │ 레벨: 이름/  │
│  L1 L2 [L12]│  ┌───────────────────────────┐  │  예산(N/M)/  │
│  [+ 새 레벨] │  │        ▧ ▧ ▧              │  │  목표/seed   │
│              │  │       ▨ ▨ ▨ ▨            │  │  /테마       │
│ [브러시]     │  │      ▧ ▨ ▧ ▨ ▧          │  │              │
│  ◉ 오픈(open)│  │   ← 레이어 쌓듯 툭툭 배치  │  │ 선택 카드:   │
│  ○ 폴드(fold)│  │      geom.slotPos 프리뷰  │  │  face(오픈/  │
│  [스냅 ▦ on] │  │      = 게임과 픽셀 동일    │  │   폴드) 토글 │
│              │  └───────────────────────────┘  │  layer ↑/↓  │
│ [양식]       │  클릭=배치(예산−1) · 드래그=이동 │  x,y · pile │
│  ▸ 3-Peak    │  겹침→cover 실시간 유도          │  coveredBy  │
│  ▸ 쌍봉 팬   │  Alt클릭=삭제(예산+1)           │  (읽기,수동 │
│  [스탬프]    │  층 색상/외곽선으로 open|fold 구분│   override) │
│  [현재→양식저장]                               │              │
└──────────────┴─────────────────────────────────┴──────────────┘
  상단바: [모드탭들] [저장] [◀레벨▶] [승리가능성 검사] [예산 재설정]
```

- **예산 HUD**(상시): `보드 놓음/목표 · 스택 M · 덱 잔여`. 목표 초과 시 경고, 덱(52) 초과 방지.
- **브러시**: 오픈/폴드 택1 후 캔버스 클릭 배치. 스냅 토글로 half-column 격자에 정렬(끄면 자유 배치).
- **레이어 쌓기**: 배치 시 자동 최상층, 인스펙터/단축키로 층 조정. 층별 색/외곽선으로 open·fold·가림상태를 시각 구분.
- **cover 실시간**: 놓을 때마다 겹침×레이어에서 `coverGraph` 재계산(§2.5) → 가려진 카드는 흐리게/뒷면 표시.
- **캔버스 렌더**: `geom.slotPos`(= PlayScene 복제)로 그려 **에디터==게임** 픽셀 일치.
- **양식**: 좌하단 "현재→양식저장"으로 지금 배열을 양식으로 보관. 양식 목록 클릭→"스탬프"로 현재 레벨에 붙이고 손으로 변주.
- **승리가능성 검사**: `solvable.isWinnable` DFS를 워커 실행 → 구조가 풀리는지 즉시 검증.
- **pile 게임(P3)**: pile anchor 드래그 핸들 + fan 방향/오프셋. **마작(P3)**: layer 컨트롤로 3D 스택.

---

## 5. 제공 템플릿 라이브러리 — 다양한 배치 카탈로그

> 사용자 요구: **"당신이 아주 다양한 배치를 템플릿으로 제공하고 불러다 쓸 수 있게 하라."**
> → 나(툴 제작)가 **수동 배치 메타포로 손수 저작한 배열 40~60종**을 라이브러리로 배포. 각 템플릿은 §3의 open/fold + 레이어 배치로 만들어진 CardBoard 파일(코드/파라미터 박제 아님). 사용자는 불러오기·변형·삭제 자유. 이 라이브러리가 §6 레벨 생성의 원료.

### 5.1 배치 패밀리 taxonomy (목표 규모)

| 패밀리 | 예시 배치 | 대략 종수 |
|--------|-----------|-----------|
| **Peaks(봉우리)** | 1봉·쌍봉·클래식3봉·4봉·5봉 | ~6 |
| **Pyramids(피라미드)** | 소/중/대 삼각·역피라미드·계단 | ~6 |
| **Walls/Bricks(벽돌벽)** | 2·3·4열 벽 ← **스크린샷 2** | ~5 |
| **Fans/Columns(부채꼴)** | 아크 팬컬럼 ← **스크린샷 1**·직선컬럼·피콕·캐스케이드 | ~6 |
| **Diamonds/Rhombus** | 단일·쌍 마름모 | ~3 |
| **Arches/Bridges(아치)** | 아치·터널·게이트 | ~4 |
| **Waves/Zigzag(물결)** | 웨이브·뱀·계단상 | ~4 |
| **Crosses/Stars** | 십자·플러스·별·X | ~5 |
| **Rings/Crowns(고리)** | 링·왕관·반원 | ~4 |
| **Clusters/Spiral** | 산개 미니클러스터·벌집·나선 | ~5 |
| **Symbols/Letters** | 하트·스페이드·숫자·테마 심볼 | ~6 (테마 레벨용) |
| **Grids** | 팬그리드·체커보드 | ~3 |
| **합계** | | **≈57종 목표** (P2 시작 ~12, 점증) |

- 각 템플릿에 태그 부여: `family`, `baseCards`(기준 장수), `difficultyBand`(1~5), `symmetrySafe`(미러/회전 가능 여부), `maxLayer`(가림 깊이). 이 태그가 §6 생성기의 선택·변주 입력.
- **스크린샷 2종은 카탈로그의 canonical 예시**로 최초 저작: `fan-columns-arc`, `brick-wall-3`.

### 5.2 불러오기 UX

- 카드레벨 모드 좌측 "양식" 패널 = 이 라이브러리 브라우저(패밀리 탭 + 검색 + 썸네일).
- 클릭 → **스탬프**(현재 레벨 캔버스에 배열 붙여넣기) → 손으로 변주. `instantiateBlock` 재사용.
- 사용자가 만든 배열도 "현재→양식저장"으로 같은 라이브러리에 축적(프로젝트 공유는 블록 라이브러리 경유).

---

## 6. 레벨 생성 구조 — ~1,000 레벨

> 사용자 요구: **"약 1천 종의 다양한 레벨을, 이 기본 설계 위에서 생성할 수 있는 구조."**
> 손으로 1,000판을 놓는 건 불가능 → **템플릿 라이브러리 × 변주 × 난이도 곡선**으로 대량 생성하되, 어느 레벨이든 열어서 손으로 override 가능(§3 하이브리드 유지).

### 6.1 생성 파이프라인 (레벨 i, i=1..1000)

```
tier(i)  ── 난이도곡선 ──▶  { 템플릿풀, 보드예산 N, 스택 M, 최대층, open/fold비, 변주강도 }
    │
① 템플릿 선택   seed=hash(i) 로 풀에서 1~3개 픽 (다중=쌍봉/삼중 클러스터)
    │
② 변주 적용     mirror/rotate · 장수 스케일(행·팬 확장) · 가림깊이(층 추가)
    │            · jitter(비격자 미세오프셋) · 클러스터 합성 · open/fold비
    │
③ cover 유도    겹침×레이어 (§2.5) → open/fold 확정
    │
④ 승리성 보장   solvable DFS: (open≥1) && (최심 가림깊이 ≤ 플레이가능) 아니면
    │            층 완화/스택 증가/reseed 재시도 (게임 dealWinnable과 정합)
    │
⑤ 다양성 dedup  signature=(family,N,대칭,가림깊이 히스토그램); 최근 K개와 근접하면 파라미터 퍼터브
    ▼
  concrete CardBoard(레벨 i)  또는  recipe{templateId,variation,seed}
```

### 6.2 난이도 곡선 (예시, 튜너블)

| 레벨 구간 | 보드 장수 | 봉/클러스터 | 가림 깊이 | 스택 여유 | 템플릿 풀 |
|-----------|-----------|-------------|-----------|-----------|-----------|
| 1–50 | 18–22 | 1–2 | 얕음(1–2층) | 넉넉 | Peaks·Pyramids 소형 |
| 51–200 | 22–28 | 2–3 | 중(2–3층) | 보통 | + Walls·Fans |
| 201–500 | 26–32 | 3 | 깊음(3층) | 빠듯 | + Diamonds·Arches·Waves |
| 501–800 | 30–36 | 3–4 | 깊음 | 빠듯 | + Crosses·Rings·Clusters |
| 801–1000 | 34–40 | 4+ | 최대 | 최소 + 와일드 의존 | 전 패밀리 + Symbols |

- 곡선·패밀리 가중치는 **하드코딩이 아니라 생성 config**(`generation.config.json`)로 노출 → 디자이너가 조정하면 1,000 레벨 재생성. 이것이 요구된 "구조".

### 6.3 저장 전략 — recipe vs baked (하이브리드)

- **기본 = recipe(압축)**: 레벨당 `{templateId, variation, seed}` 소형 레코드. 생성기가 결정론적으로 보드 전개. 1,000개가 작고 재현·수정 용이.
- **bake-on-edit**: 특정 레벨을 손으로 고치려 열면 그 레벨만 explicit CardBoard로 baked → override 저장(§3.4). generate로 재빌드해도 baked 레벨은 보존.
- → **"생성으로 대량 + 손으로 골라 정밀보정"** = §0 하이브리드 결정과 일치. 어떤 생성 레벨도 카드레벨 모드에서 열어 open/fold·레이어를 직접 만질 수 있음.

### 6.4 대량 저작 UX

- 레벨 목록 상단 **"N레벨 생성"** 버튼: config + 라이브러리 → 1..N 레시피 일괄 생성 + 진행바 + 다양성/승리성 리포트.
- 각 레벨 카드에 상태 배지: `recipe` / `baked(수동)` / `⚠승리불가` / `⚠오픈0`.
- "이 레벨만 재생성", "이 구간 재생성", "seed 고정/교체" 로 부분 갱신.
- 미리보기 그리드: 수십 개 썸네일을 한눈에 훑어 다양성 육안 점검.

---

## 7. 재사용 vs 신규 구현

### 재사용 (기존 인프라)
- 모드 등록: `boot.js` 씬 배열 + `mountModeTabs` 키 + `mode-tabs.js` `MODES`/`BARS`.
- 캔버스 pan/zoom, 에셋 로딩: 공용 에디터 인프라.
- 카드 프리뷰 렌더: `registerNodeRenderer('cardSlot', fn)` 또는 `repeater` 노드.
- 커스텀 양식 재사용: `captureBlock`/`instantiateBlock`(keyMap).
- 저장: `/__ui_layout`(보드 doc) + 신규 `/__card_levels`(레벨 인덱스), `.pue/current.json` 포인터, staging→apply 패턴.
- 레벨별 표시 패턴: `computeLevelSuppression` **패턴만** 참고(구조는 별도 `_index.levels[]`).

### 신규 (순수코어 우선, 헤드리스 + vitest)
| 파일 | 역할 |
|------|------|
| `src/schema/cardBoardSchema.js` | CardBoard coerce/검증(piles/slots/face/layer) |
| `src/card/coverGraph.js` | **겹침×레이어에서 coveredBy 유도(§2.5)** + open/fold 확정. 격자 스냅은 특수케이스 |
| `src/card/placement.js` | 손 배치 조작(추가/삭제/이동/층조정) 순수 op + 예산 카운터 |
| `src/card/savedTemplate.js` | 배열 스냅샷을 양식으로 저장/스탬프(수제, `instantiateBlock` 재사용) |
| `src/card/solvable.js` | 승리가능성 DFS (게임과 이후 공유) |
| `src/card/geom.js` | `slotPos` 픽셀 수학 (프리뷰 ↔ 게임 공유 계약) |
| `src/card/variation.js` | 배열 변주 op (mirror/rotate/scale/jitter/가림깊이/클러스터합성) |
| `src/card/generateLevels.js` | **레벨 생성기(§6)**: config+라이브러리 → 1..N recipe, 승리성·다양성 보장 |
| `src/card/templateLibrary.js` | 템플릿 카탈로그 로드/태그/검색(§5) |
| `src/editor/CardLevelScene.js` | 카드레벨 모드 씬(브러시·예산 HUD·캔버스·양식 브라우저·생성) |
| `src/vite/plugins.js` (+) | `/__card_levels`, `/__card_templates` 엔드포인트 |

---

## 8. 파일 구조 — **게임 프로젝트에 위치** (예: `Solitare/`)

> 데이터는 에디터가 아니라 **게임 프로젝트**에 산다. 아래 경로는 `D:/Dev/CasualGame/games/Solitare/` 기준. (툴 코드만 §7의 `phaser-ui-editor/src/card/`·`src/editor/`에 위치)

```
public/ui/card-levels/    # ← Solitare 프로젝트 (게임 소유 데이터)
  templates/              // ★ 제공+사용자 양식(손 배치 배열 스냅샷, 코드 아님)
    triple-peak.json      //   ← 세로 스크린샷 재현 (30장)
    fan-columns-arc.json  //   ← 부채꼴 아크
    brick-wall-3.json     //   ← 벽돌벽
    …                     //   (§5 카탈로그 ~57종)
  generation.config.json  // ★ 난이도곡선·패밀리가중치·변주강도 (1,000레벨 재생성 소스)
  _index.json             // { levels: [ {id,name,budget,state:'recipe'|'baked',...} ] }
  level-0001.recipe.json  // { templateId, variation, seed }  ← 기본(압축)
  level-0007.board.json   // baked: 손 override된 explicit CardBoard
  ...
```
- `templates/`·`generation.config.json`은 사용자가 열어 편집 자유. **1,000 레벨 = 대부분 recipe(작음) + 손본 것만 baked.** `generateLevels`가 config+라이브러리로 recipe 일괄 생성/재생성.
- staging→apply는 기존 패턴. 이후(Phase 4) 게임 소비: `levels.ts::levelDef(lv)`가 recipe면 생성기로 전개, baked면 직접 로드 → `dealWinnable(board)`. `geom.js`·`solvable.js`가 **프리뷰==게임** 계약.

---

## 9. 단계별 구현 계획

| Phase | 범위 | 산출 | 검증 |
|-------|------|------|------|
| **P0 코어** | cardBoardSchema, coverGraph(겹침×레이어 유도), placement op, geom, solvable 포팅 | 순수·헤드리스·게임무관 | vitest (가림유도/open·fold/승리가능성) |
| **P1 손배치 MVP** | CardLevelScene 등록, 오픈/폴드 브러시, 예산 HUD, 캔버스 배치(레이어 쌓기+스냅옵션), WYSIWYG 프리뷰, 보드1개 저장/로드, 승리가능성 검사 | **손으로 TriPeaks 배열 저작** | 육안 |
| **P2 템플릿 라이브러리** | 양식 브라우저(패밀리탭·썸네일·검색), 스탬프+변주, "현재→양식저장", **카탈로그 ~12종 손 저작 배포**(스크린샷 2종 포함) | 다양한 배치 불러다 씀 | 육안 |
| **P3 레벨 생성 엔진(★1,000)** | variation op, generateLevels(config·풀·변주·승리성·다양성), generation.config, recipe/baked 하이브리드, "N레벨 생성" UX·리포트·재생성 | **~1,000 레벨 대량 생성** | vitest(승리성/다양성) + 육안 |
| **P4 카탈로그 확장** | 템플릿 ~57종까지 확충, 테마 심볼, pile family(Klondike/FreeCell)·마작 layer(선택) | 다변형 커버 | 육안 |
| **P5 게임 소비**(연동, 지연) | levels.ts가 recipe 전개/baked 로드, geom/solvable 공유 계약, apply 파이프라인 | 저작→플레이 실사용 | 게임 플레이 |

**현재 결정 = P0~P3 (손 배치 저작 + 템플릿 라이브러리 + 1,000 레벨 생성 + 미리보기).** P5(게임 라이브 연동)는 지연 — 단 P0의 `geom.js`/`solvable.js`를 게임과 공유 가능하게 설계해 프리뷰가 게임과 픽셀·풀이 동일하도록 미리 맞춤.

---

## 10. 핵심 리스크 / 함정

1. **좌표계 불일치**: 프리뷰가 `PlayScene.slotPos`(pxUnit≈136/pyUnit≈105/카드132×181)를 정확 복제 못하면 "에디터에선 예뻤는데 게임에선 어긋남". → `geom.js` 단일출처, 게임도 이후 같은 모듈 사용.
2. **가림 그래프가 난이도 그 자체**: 겹침 임계(`OVERLAP_MIN`) 유도가 틀리면 승리불가/너무쉬움, 또는 오픈 카드 0장(플레이 불가). → `coverGraph.js` 겹침×레이어 규칙 vitest 고정, 배치 중 "오픈 카드 ≥1" + 승리가능성 검사 상시. 겹침 임계는 카드 크기 대비 비율로 명확히.
3. **staging 렌더 함정**(메모리 기록): 에디터는 스테이징 렌더 — 레이아웃 파일 직접편집은 무효. 카드 보드도 동일 경로 준수.
4. **범용화 과설계**: pile 게임을 처음부터 완벽히 안 만들어도 됨 — 스키마 필드만 예약하고 P1~P2는 TriPeaks에 집중, P3에서 채움.
5. **레벨=tier 혼동 금지**: `layout.levels{count,current}`(같은 보드의 업그레이드 단계)와 카드 레벨(서로 다른 보드)은 다른 개념. 별도 `_index.levels[]`로 관리, suppression 패턴만 참고.
6. **1,000 레벨 반복감(다양성)**: 변주가 약하면 40종 템플릿이 티나게 반복. → signature dedup(§6.1⑤) + 패밀리 로테이션 + 미리보기 그리드로 육안 점검. 다양성 리포트 필수.
7. **대규모 승리성 보장 비용**: 1,000판 DFS가 느릴 수 있음. → 구조 승리성은 경량 휴리스틱(open≥1, 가림깊이≤스택여유)으로 1차 필터, 완전 DFS는 샘플/의심 레벨만. 최종 승리는 게임 `dealWinnable`이 런타임 보장.
8. **recipe 결정론**: 생성기가 `Math.random()`에 의존하면 재현 불가·회귀 위험. → seed(mulberry32) 주입만 사용, 같은 config+seed=같은 보드. (에디터 워크플로 스크립트도 Date/random 금지 규칙과 동일 정신)

---

## 10.5. 선행 산출물 (구현 착수 전 제공됨)

> **저장소 구분**: 이 툴 **코드**는 에디터 저장소(`phaser-ui-editor`)에, **데이터**(템플릿·레벨)는 **게임 프로젝트 `Solitare/public/ui/card-levels/`**에 둔다. 에디터는 범용 다중프로젝트 도구이므로 기능은 공유, 데이터는 게임 소유. 에디터 현재 프로젝트 포인터(`editor-app/.pue/current.json`)는 이미 Solitare를 가리킴.

- **스크린샷 시제작 템플릿 3종** — `Solitare/public/ui/card-levels/templates/{triple-peak,fan-columns-arc,brick-wall-3}.json`. CardBoard 스키마 실데이터, coverGraph 유도 검증 완료. (삼봉=세로 실게임 재현 30장)
- **자립형 템플릿 저작 툴**(HTML 아티팩트) — 오픈/폴드 브러시 + 레이어 쌓기 + 스냅/대칭/삽입 스캐폴드 + 라이브러리(localStorage) + JSON 내보내기/가져오기. **에디터 모드(P1) 구현 전에 이미 다양한 템플릿을 대량 저작 가능.** 내보낸 JSON = P0 스키마 그대로 → 카탈로그(§5)의 소스가 됨. 이 툴이 P1 CardLevelScene의 UX 레퍼런스(브러시·예산HUD·검증·layerAt 자동층·§2.5 coverGraph)이기도 함.

## 11. 다음 액션 (승인 시)

1. **P0** `src/card/` 순수코어 + vitest: `coverGraph`(겹침×레이어 유도), `placement`(추가/삭제/이동/층·예산 op), `geom`(slotPos 복제), `solvable`(게임 `solvable.ts` 포팅), `variation`(mirror/rotate/scale/jitter).
2. **P1** `CardLevelScene.js` MVP + boot/mode-tabs 등록: 오픈/폴드 브러시, 예산 HUD, 레이어 쌓기 배치, WYSIWYG 프리뷰, 승리성 검사.
3. **P2** 템플릿 라이브러리: 스크린샷 2종(`fan-columns-arc`·`brick-wall-3`) 포함 ~12종을 **손으로 저작해 파일 배포** + 브라우저·스탬프.
4. **P3** `generateLevels` + `generation.config` + "N레벨 생성" UX → **1,000 레벨 시범 생성**·다양성/승리성 리포트.

> 관련 문서(에디터 저장소 `phaser-ui-editor/docs/`): `COMPONENT_LIBRARY_PLAN.md`(블록 재사용), `CUTSCENE_EDITOR_PLAN.md`(신규 모드 패턴), `SERVER_TOOL_PLAN.md`(시각 저작 철학).
