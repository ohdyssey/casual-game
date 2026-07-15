# 층(Floor) 레벨 데이터 — `floor-levels/`

층 디자인 에디터(`design/floor-editor.html`)가 저작한 **각 층의 화면 구성**이 여기에 산다.
카드 배치 에디터(`card-editor.html` → `card-levels/`)와 **별개**다.

## 모델 (v2 · 1층 = 마스터 템플릿)

| 레이어 | 의미 | 범위 | 쓰이는 화면 |
|--------|------|------|-------------|
| `facade`    | 상단 층배치(상점 storefront) | **전 층 공유 위치** | 홈 타워 + 플레이 |
| `roof`      | 지붕/차양 | **전 층 공유 위치** | 홈 타워 + 플레이 |
| `glass`     | 유리가이드 펜스(진열장/미션 가드) | **전 층 공유 위치** | 홈 타워 + 플레이 |
| `character` | 캐릭터(셰프/직원) | 층 전용 | 홈 타워 + 플레이 |
| `interior`  | 하단 내부도(보드 뒤 매장 내부) | **전 층 공유 위치** | **플레이 전용** |

- **template**(facade/roof/glass/interior) = 1층에서 정한 **위치·크기를 전 층 공유**. 층마다 **이미지만** `overrides` 로 교체.
- 건물 하단은 모든 층 동일 지점 **`buildingBottom` = 645**(DARK_TOP)에 정렬.
- 렌더 순서(하→상): `interior · facade · roof · character · glass` → **캐릭터는 유리 뒤**.
- **홈 타워화면** = `facade+roof+glass+character`(층별 세로 스택, `homeBand` 높이 = 피치). **플레이화면** = 전체(+`interior`).

좌표계 = 프레임 **1080×2400**. 요소 = `{ id, asset, x(중심), y(중심), w, h, rot, flipX }`. `asset` = `public/ui/uploads/<asset>.png` 파일 stem.

## 파일

- `_index.json` — 층 목록(`{id,index,name,theme}`).
- `<slug>.json` — 단일 층(`kind:"floorLayout"`, template+override 해석본).
- `floorLevels.json` — 전체 팩(`kind:"floorLevelPack"`, `template:{...}` + `levels:[{character,overrides}]`) ← "전체 내보내기".

## 워크플로

1. `design/floor-editor.html` — **1층에서 facade/roof/glass/interior 위치 확정**(전 층 공유) + 층마다 이미지·캐릭터 교체.
2. **전체 내보내기** → `floorLevels.json` → 이 폴더(배포 시 `public/levels/`)에 저장.
3. 게임이 `src/logic/floorLevels.ts`(`coercePack`/`placementsForHome`/`placementsForPlay`)로 소비.

> 소비(HomeScene/PlayScene 렌더 배선)는 별도 단계 — `floorLevels.ts` 계약은 준비 완료.
