# 포링크룸 (PawLink)

> 같은 펫 아이템 2개를 **≤2번 꺾이는 경로**로 이어 짝을 맞춰 제거하는 라인 퍼즐
> (Onet / 시센쇼 / 사천성 류). 허브 등록 id `pawlinkroom`, devPort **6205**, accent `#F2A33C`.

**상태(2026-06-17): 플레이 가능한 v1 구현 완료.** `npm run dev:pawlink`(포트 6205) 또는 허브에서 실행.
독립 에셋 데이터 에디터는 [editor.html](editor.html) 로 분리(게임 진입점 `index.html` 과 이름 충돌 해소).

---

## 1. 게임 규칙 (장르 정의)

1. 같은 아이템 2개를 선택한다.
2. 두 아이템을 잇는 경로가 **빈 칸 / 보드 바깥 한 칸 여백(routing margin)** 만 지나고,
   **꺾임이 2번 이하**면 연결 성공 → 두 아이템 제거.
3. 점유된 칸은 경로가 통과할 수 없다(직선·1꺾임·2꺾임만 허용).
4. 제거가 늘수록 빈 칸이 늘어 경로가 넓어진다 → 외곽/쉬운 것부터.
5. **제한 시간** 안에 **목표(아이템별 개수)** 를 달성하면 클리어. 별 게이지 3단계.
6. 부스터: 힌트 · 셔플 · 시간정지 · 자동연결 · 폭탄.

**핵심 제약(데이터 무결성):**
- 아이템 종류별 개수는 **짝수**여야 짝을 맞출 수 있다.
- 보드는 **완전 클리어 가능(solvable)** 해야 한다.
  보장 생성법 = **역구성(reverse-construction)**: 빈 보드에서 현재 점유 기준 연결 가능한
  두 빈 칸에 페어를 배치하는 일을 반복 → 제거 순서가 배치의 역순이면 항상 풀린다.
  폴백 = 도미노 타일링(인접 동일 쌍은 사이 칸이 없어 항상 연결 가능).

---

## 2. 독립 에디터 — `index.html`

무빌드 단일 HTML(바닐라 JS, 의존성 0). **더블클릭(file://)** 또는 정적 서버로 열면 됩니다.

기능:
- **아이템 카탈로그** 편집 — id·이름·이모지(폴백)·`up_PawLink_item_NN` tex 키 자동 부여.
- **레벨별 그리드** 페인팅 — 클릭/드래그로 칠하기, 우클릭/`E`=지우개, 숫자키=아이템 선택.
- **레벨 메타** — 크기(cols×rows), 제한시간, 별 임계, id, 이름.
- **목표 / 부스터** 편집(레벨별 + 전역 기본).
- **🎲 솔버블 자동생성** — 목표 아이템 우선 + 균등 분배로 보드를 채우고 풀이가능 보장.
- **✅ 실시간 검증** — 짝수 패리티 · 풀이가능(solve) · 목표 도달성 · 별 임계 정렬.
- **▶ 플레이테스트** — 실제 연결 판정으로 보드를 직접 풀어 검증(경로를 SVG로 표시).
- **입출력** — JSON 내보내기/복사/가져오기 + `localStorage` 자동 저장.

> `index.html` 안의 연결 판정 로직(`connectable` / `findPath` / `solve` /
> `generateSolvable`)이 **게임 로직의 SSOT 초안**입니다. 게임 구현 시 그대로
> `src/logic/connect.ts`(Phaser 비의존 + vitest)로 이관하세요.

---

## 3. 에셋 데이터 스키마 (에디터 산출 = 게임 런타임 계약)

게임은 이 JSON을 `public/data/levels.json` 으로 로드할 예정입니다.

```jsonc
{
  "schema": "pawlink.assets",
  "version": 1,
  "meta":  { "gameId": "pawlinkroom", "title": "포링크룸", "designW": 720, "designH": 1280, "accent": "#F2A33C" },
  "rules": { "maxTurns": 2, "routeOutsideBorder": true },
  "items": [ { "id": "can_blue", "name": "강아지 통조림", "emoji": "🥫", "tex": "up_PawLink_item_01", "goalGroup": "can" } ],
  "boosters": { "hint": 5, "shuffle": 4, "timeStop": 3, "autoLink": 3, "bomb": 2 },
  "levels": [ {
    "id": 1, "name": "스테이지 1", "cols": 6, "rows": 7, "timeSec": 120,
    "stars": [20, 50, 80],                       // 클리어 시 남은 초 임계(오름차순)
    "goals": [ { "item": "carrot", "count": 10 } ],
    "boosters": { "hint": 5 },                   // 레벨별 오버라이드(미지정 시 전역)
    "grid": [ ["can_blue", null, "carrot", ...] ] // rows×cols, 셀 = 아이템 id 또는 null(빈칸)
  } ]
}
```

---

## 4. 기술 스택 (형제 게임 계승)

- **Phaser 3.90 + TypeScript + Vite**, 공용 엔진 `@casual/core` 의 `GameModule`(Load→Play).
- 화면 SSOT = `public/ui/layouts/main.json`(phaser-ui-editor) + `public/ui-assets.json` 매니페스트.
- 아이템 아트 = `up_PawLink_item_NN`(에디터 업로드), 미로드 시 이모지 폴백(`assets.ts` 매핑).
- 순수 로직 = `src/logic/*.ts` + vitest(Phaser 비의존, 불변, RNG 주입).
- `designHeight: 1280`, FIT 레터박스(세로 고정), accent `#F2A33C`.

## 5. 구현 현황

완료(v1):
- [x] `package.json` / `tsconfig.json` / `vite.config.ts`(port 6205) / 게임 진입 `index.html`. 에디터는 `editor.html` 로 분리.
- [x] `src/logic/connect.ts` — 연결 판정/풀이가능/솔버블 생성/셔플 + `connect.test.ts`(11)
- [x] `src/logic/gridLayout.ts` — §7 패널 앵커 비례 그리드 + `gridLayout.test.ts`(5, 배치 6×6 재현 검증)
- [x] `src/logic/levels.ts` — 레벨 진행(형태/종류/시간) + 솔버블 보드 빌드 + `levels.test.ts`(3)
- [x] `src/assets.ts` — SSOT 로드 + 아이템(UI_09-01..10)·슬롯(UI_15) 카탈로그
- [x] `src/scenes/LoadScene.ts` / `PlayScene.ts` — 보드 렌더·탭 연결·경로 플래시·제거·타이머·목표·부스터5·교착 자동셔플
- [x] 허브 `games.config.js` `pawlinkroom` → live:true, devPort 6205, prodUrl '../pawlink/'
- [x] 루트 `package.json` 동시 기동 배선. 검증: 타입 OK · vitest 19 · build OK · headless 스모크 OK(그리드 중심=패널 중심)

차기(폴리시):
- [ ] 클리어/콤보/시간종료 연출 강화, 별 게이지(3단계) 표시, 효과음
- [ ] `public/data/levels.json` authored 레벨 로더(현재는 progression 런타임 생성)
- [ ] 점수/베스트 HUD 노출, 부스터 경제(코인 소비) 연동(@casual/core liveops)
- [ ] PlayScene 분리(보드 상태 머신 / 부스터 모듈)로 파일 크기 정리

---

## 6. 저장된 레이아웃 (phaser-ui-editor SSOT) — `public/ui/layouts/main.json`

frame 720×1280, `fit: "fit"`, `origin: "center"`. 디자인 좌표 기준 배치(전부 origin 중심):

| 영역 | 노드(name / key) | 중심 (x,y) | 크기 (w×h) | 비고 |
|------|------------------|-----------|-----------|------|
| 배경 | 배경 / `BG_01` | 360,640 | 720×1280 | 펫방(우드플로어·창문·펫베드) |
| 상단 HUD | 레벨 패널 / `UI_01` | 71,77 | 99×88 | 레벨 뱃지 + 텍스트 "45" |
| 상단 HUD | 코인 패널 / `UI_02` | 219,75 | 158×60 | 텍스트 "12,450" |
| 상단 HUD | 젬 패널 / `UI_03` | 386,77 | 153×55 | 텍스트 "300" |
| 상단 HUD | 설정 / `UI_04` | 673,73 | 59×59 | 기어 버튼 |
| 목표 | 공지/목표 패널 / `UI_16` | 241,261 | 322×185 | 말풍선(발바닥) — 목표 표시 |
| 캐릭터 | 캐릭터 / `UI_05-1` | 522,222 | 99×134 | 펫 캐릭터 |
| 타이머 | 시간 게이지 / `UI_08` | 360,408 | 572×52 | 진행 바 |
| 타이머 | 텍스트 "01:28" | 360,369 | fs 37 | 남은 시간 |
| **퍼즐** | **퍼즐 배경(rect) / `layer_4`** | **361,766** | **641×648** | radius 19, alpha 0.7, fill `#dfa888` — **그리드 컨테이너(앵커)** |
| 퍼즐 | 셀 타일 ×36 / `UI_15` | 6열×6행 | 99×101 | x∈{102,206,310,414,517,621}, y∈{503,608,712,818,924,1029} |
| 퍼즐 | 아이템 아이콘 ×12 / `UI_09-01…10` | 행 502·608 | ~85×84 | 샘플 콘텐츠(실제는 데이터로 채움) |
| 하단 부스터 | `UI_10`/`11`/`12`/`13`/`14` | y=1179, x=92·226·359·492·625 | 121×~107 | 힌트·셔플·시간정지·자동연결·폭탄(라벨 y=1214) |

> 셀 타일 `UI_15`(원본 110×112, ar 0.982)·아이템 `UI_09`(원본 ~84² 정사각)은 모두 `lockAspect`.
> 현재 저장본은 **6×6(36칸)** 정적 배치 — 이건 **참고용 스냅샷**이고, 실제 게임 그리드는 §7 계약으로 **동적 계산**한다.

## 7. 퍼즐 그리드 기하 계약 (패널 앵커 · 비례 · 무드리프트)

**원칙: 그리드는 항상 `퍼즐 배경` rect 에서 파생한다.** 셀을 개별 좌표로 박지 않는다.
패널 `{cx:361, cy:766, w:641, h:648}` 과 `(cols, rows)` 만 주면 셀 크기·간격·시작점이 결정되고,
**패널 중심에 정렬**되므로 cols/rows 가 늘거나 줄어도 비례만 바뀔 뿐 배치가 어긋나지 않는다.

```ts
// → src/logic/gridLayout.ts (Phaser 비의존, 순수·테스트 대상). 에디터 연결로직과 동일한 SSOT 패턴.
export interface Panel { cx: number; cy: number; w: number; h: number; }
export interface GridGeom { cell: number; gap: number; gridW: number; gridH: number; left: number; top: number; }

const PAD_RATIO = 0.02;    // 패널 라운드 베벨
const GAP_RATIO = 0.06;   // 셀 크기의 6% 를 셀 간격으로
const MARGIN_RATIO = 0.65; // ★ 외곽 라우팅 여백(각 변, 셀 단위) — 외곽 우회 연결선 공간 확보

export function gridLayout(panel: Panel, cols: number, rows: number): GridGeom {
  const innerW = panel.w * (1 - 2 * PAD_RATIO);
  const innerH = panel.h * (1 - 2 * PAD_RATIO);
  // 각 변에 MARGIN_RATIO 셀의 여백 + 셀 간격을 포함해 짧은 축 fit (정사각, 절대 넘침 없음).
  const span = (n: number) => n + 2 * MARGIN_RATIO + GAP_RATIO * (n - 1);
  const cell = Math.min(innerW / span(cols), innerH / span(rows));
  const gap = GAP_RATIO * cell;
  const gridW = cols * cell + (cols - 1) * gap;
  const gridH = rows * cell + (rows - 1) * gap;
  return { cell, gap, gridW, gridH, left: panel.cx - gridW / 2, top: panel.cy - gridH / 2 };
}

// 셀 (c,r) 의 중심 좌표(디자인 px). c/r 은 -1..cols/rows 도 허용(외곽 우회 경로 렌더).
export function cellCenter(g: GridGeom, c: number, r: number) {
  return { x: g.left + g.cell / 2 + c * (g.cell + g.gap), y: g.top + g.cell / 2 + r * (g.cell + g.gap) };
}
```

**라우팅 여백(2026-06-17 추가):** 외곽 칸이 보드 바깥으로 우회 연결될 때 경로점은 그리드 한 칸 바깥
(`cellCenter(g, -1, …)`)을 지난다. `MARGIN_RATIO 0.65` 로 그리드 둘레에 ≈0.65셀의 빈 공간을 확보해
그 경로선이 패널 안에 들어와 보이게 한다(외곽 우회 ≈0.56셀 필요 → 여유). 검증: 4×4 기준 그리드-패널 왼쪽
여백 ≈0.76셀, 경로점이 패널 경계 안쪽. 그리드 중심 = 패널 중심(무드리프트 0)은 그대로 유지.

렌더 규칙:
- 셀 배경 = `UI_15` 를 `cell × cell`(아이템 = `cell*0.82`). 연결 판정은 격자 인덱스 기반이라 셀 픽셀 크기 무관 — 비주얼만 §7로 정한다.
- **바탕 패널**(`퍼즐 배경` rect, radius 19)은 `layoutLoader` 가 Graphics `fillRoundedRect` 로 그린다(Phaser `Rectangle` 은 반경 미지원).
- **시간 게이지**(`UI_08` 트랙)는 안쪽 채널(좌우 캡 인셋·막대 두께)에 맞춰 라운드 막대로 채운다(`PlayScene.drawTimerBar`).
- 외곽 여백(routing margin)은 그리지 않는 논리 칸(cols+2). 패널 padding 과는 별개.
