<!-- pue-harness:start — 자동 생성. 이 구획은 `pue export` 가 덮어씁니다 -->
## 화면 배치 (AI 하네스)

이 프로젝트의 UI 배치는 `.pue-harness/` 에 있습니다. 화면을 구현·수정할 때 **반드시 먼저 읽으세요.**

- 좌표 규약과 읽는 법: `.pue-harness/README.md`
- 화면별: `.pue-harness/screens/<id>.md` (설명·배치도) · `.json` (**정확한 수치 = 진실**) · `.html` (브라우저로 열어 보는 보조 뷰)
- 노드 id 상수: `.pue-harness/generated/screens.js` — **id를 직접 문자열로 쓰지 말고 이 상수를 쓰세요**
- 현재 화면 3개: main, main_copy, main_copy2

배치를 바꿔야 할 것 같으면 코드로 하드코딩하지 말고 **사용자에게 에디터에서 수정하라고 알리세요.**
`.pue-harness/` 는 생성물이므로 직접 편집 금지.
<!-- pue-harness:end -->

## 화면비 대응 표준 (필수)

화면을 만들거나 고칠 때 **반드시 먼저 읽으세요.** 규칙 원본(SSOT)은 모노레포 공통입니다:

→ `d:/Dev/CasualGame/packages/core/docs/RESPONSIVE_STANDARD.md`
  (리포 루트 기준 `packages/core/docs/RESPONSIVE_STANDARD.md` — 다른 폴더에서 작업할 땐 위 절대경로를 쓰세요)

요지: 저작 프레임 / **세이프존(항상 보임)** / 블리드(잘려도 됨) 3층으로 나누고,
캔버스를 **양축 가변**(세로가 하한에 닿으면 폭을 늘림)으로 산출해 FIT 검은 여백을 없앤다.
배경은 축소하지 않고 크롭/확장한다. 구현은 `@casual/core` 의 `designSize.ts`.

### 이 게임의 현재 상태 (2026-08-04 실측)

| 항목 | 값 |
|---|---|
| 저작 폭(designWidth) | 1080 |
| 캔버스 높이 모드 | 고정 2400 |
| 레이아웃 프레임 | 1080x2400(3개) |
| 배경 노드 최대 폭 | 3189px |
| **채택 상태** | 🟢 **즉시 적용 가능** |

배경이 가로 블리드를 충분히 갖고 있어 **에셋 재작업 없이** 적용할 수 있습니다.

```ts
// src/game.ts — designHeight 를 아래 두 줄로 교체
designHeightRange: { min: 2200, max: 2400 },
designWidthRange:  { min: 1080, max: 1600 },
```

적용 전 표준 문서 5절의 **채택 전제 조건 3가지**를 확인하세요 —
특히 게임플레이 좌표가 절대 x(예 `540`)가 아니라 `w/2` 상대 좌표여야 합니다.
레이아웃 소비 측에 `pinX`(세이프존 중앙정렬) 흡수도 함께 배선해야 합니다.
