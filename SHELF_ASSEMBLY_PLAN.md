# 조립식 진열장(9-slice) 계획 — SHELF_ASSEMBLY_PLAN

> 9종 부품으로 임의 `cols×rows` 진열장을 조립. 고정 진열장 이미지(shelf9/12/shelf)를 대체.
> 작성 2026-06-04 · 대상 `games/store` · 상태: **레벨1 적용·검증 완료**

## 1. 목표

`D:\캐쥬얼 게임\Store`에 추가된 9종 부품(`CG_ST_BG_{Left|Center|Right}0{1|2|3}`)으로
진열장을 **조립식**으로 생성한다. 한 장짜리 진열장 이미지를 칸 수마다 따로 그리던 방식
(shelf9=9칸 / shelf12=12칸 / shelf=15칸)을 **단일 조립 함수**로 통합 → 임의 칸 수 지원·아트 중복 제거.

## 2. 부품 인벤토리 (소스 px — **가로형 키트, 2026-06-04 갱신**)

> 초기 정사각 키트(340×349…)는 상하가 과대해 가로형으로 교체됨.

| | Left(열0) | Center(중간 열) | Right(끝 열) |
|---|---|---|---|
| **01 (상단 행)** | 351×231 | 339×231 | 351×231 |
| **02 (중간 행)** | 351×213 | 339×213 | 351×213 |
| **03 (하단 행)** | 351×230 | 339×230 | 351×230 |

- 열 너비: **Left=Right=351**(좌우 바깥 프레임), Center=339. (Right 초기 339→재디자인 351로 좌우 대칭 복구)
- 행 높이: 01=231, 02=213, 03=230.
- **버트 타일링**(겹침 없음). 열 너비·행 높이 일정 → 격자 정합. 3행 조립 = 1041×674.

## 3. 모델

- 내부 칸 인셋(소스 px): 안쪽 분리대 절반 **INNER=13**, 바깥 프레임 **가로 OUTER_X=25 / 세로 OUTER_Y=31**.
  - 너비차 `351-339=12` → `OUTER_X=INNER+12`. 높이차 `231-213=18` → `OUTER_Y=INNER+18`.
- 역할별 인셋: Left 열 좌=OUTER_X · Right 열 우=OUTER_X · 01 행 상=OUTER_Y · 03 행 하=OUTER_Y · 나머지=INNER.
- **세로 배치 = 밴드 중앙 정렬**(`centerY=(sTop+sBottom)/2`). 가로형이라 하단 정렬 시 상단 여백 과다 → 중앙 정렬.
- **하단 전시 행(displayRows)**: 게임 칸 아래에 추가 행. `assembleShelf(cols, playRows, …, displayRows)` → `cells`(게임 상단 playRows)와 `displayCells`(하단 전시) 분리. 행 역할은 전체 기준(전시 행이 03=하단 프레임, 플레이 막행은 02). **레벨1=displayRows 1**. 전시 상품 `goods01~03`(상품 박스)를 `StoreScene.placeDisplayGoods`가 칸 바닥 정렬·폭 0.84로 배치(게임 무관 장식).
- **핵심: 행/열을 늘려도 새 부품이 필요 없다.** 중간 행은 02, 중간 열은 Center를 반복 → 9부품으로 N×M 무한 확장.
  - 3×3 → 행 `[01,02,03]`
  - 3×4 → 행 `[01,02,02,03]`
  - 3×5 → 행 `[01,02,02,02,03]`

## 4. 구현

| 파일 | 역할 |
|---|---|
| `scenes/shelfAssembly.ts` | **순수 조립**. `assembleShelf(cols,rows,targetW,centerX,bottomY)` → `{parts[], cells[], bounds}`. 부품 위치·크기 + 내부 칸 중심(cellGeom) 계산. `partKey(col,row)`로 에셋 키 매핑. |
| `assets.ts` | 9개 부품 키 등록(`shelf_left01` … `shelf_right03`). LoadScene 자동 로드. |
| `logic/types.ts` | `LevelConfig.useShelfParts?: boolean`. |
| `logic/levels.ts` | `generateLevel`: `useShelfParts = (levelIndex===0)` — **우선 레벨1만**. |
| `scenes/StoreScene.ts` | `buildShelf`가 플래그 보면 `buildShelfFromParts()`로 분기. 부품 이미지 N장 배치(+1px 블리드로 seam 방지) + `cellGeom=asm.cells`. 진열장별 보정 필드 `floorOffset`/`rowOffsets`(조립식=평면 0, 기존=GRID 원근값) → `render`/`slotGeom` 공용. |

검증: `npm run typecheck` 0 · 38테스트 · `vite build` OK · 브라우저(레벨1: 진열장 조립·상품 배치·이동/비행 애니·콘솔 0).

## 5. 로드맵

- **[완료] P1 — 레벨1 파일럿**: index 0 만 조립식. 좌표/seam/게임플레이 검증.
- **P2 — 9칸 전체(레벨 1–24)**: 플래그를 `shape.totalCells===9`(또는 `rows===3`)로 확장. 같은 `assembleShelf(3,3)`.
- **P3 — 12·15칸**: `assembleShelf(3,4)`·`assembleShelf(3,5)` — **부품 추가 불필요**(중간 행 02 반복). 기존 shelf12/shelf 이미지 대체.
- **P4 — 정리**: 단일 진열장 이미지(`shelf9/12/shelf` = CG_ST_BG_02*) 및 `computeShelfLayout` 경로 제거. 진열장 = 100% 조립식.

## 6. 미세조정 TODO (비차단)

- **세로 정렬**: ✅ 밴드 중앙 정렬 적용(가로형 키트 반영). 필요 시 centerY 미세조정.
- **상품 크기/안착**: `floorOffset`(현재 0)·내부 칸 인셋(INNER 13 / OUTER_X 25 / OUTER_Y 31) QA로 미세조정. 빈 슬롯 점선 위치 포함.
- **seam**: +1px 블리드로 해결됨. 고해상도 디스플레이서 재확인.
- **OUTER_PAD/INNER_PAD**: 시각 기반 추정(28/13). 필요 시 부품 알파 분석으로 정밀화.
