# 층(Floor) 디자인 에디터 — 설계 문서

> 각 **층(레벨)**의 화면 구성을 저작하는 도구. 카드 배치 에디터(`card-editor.html`)와 **별개 창**.
> 산출물(`floorLayout` JSON)을 게임이 **별도로 불러와** 홈 타워화면과 플레이화면에 쓴다.

## 0. 요구 (사용자 확정)

1. 카드 배치 에디터와 **다른 새 창**으로 로드(`design/floor-editor.html`).
2. **4개 배치 카테고리**로 구분 저작:
   - ① `facade` — 상단 층배치(상점 storefront)
   - ② `character` — 캐릭터(셰프/직원)
   - ③ `glass` — 유리가이드 펜스(진열장/미션 가드)
   - ④ `interior` — 하단 내부도(보드 뒤 매장 내부)
3. **소비 분리**:
   - 홈 타워화면 = `facade + character + glass` (층별 세로 스택)
   - 플레이화면 = **전체**(+ `interior`)

## 1. 구현 (이번 단계 완료)

| 산출물 | 위치 | 역할 |
|--------|------|------|
| **에디터** | `design/floor-editor.html` | 자립형 단일 HTML(의존성 0). 4레이어 배치·이동·크기·회전·z·flip, 홈/플레이 미리보기, 팔레트(uploads + 파일드롭), 층목록, localStorage, JSON 내보내기/가져오기 |
| **순수 모델** | `src/logic/floorLevels.ts` | `FloorDoc` 스키마 + `coerceFloor`/`coercePack`(입력방어) + `placementsForHome`/`placementsForPlay`/`computeHomeBand`/`stackPitch`. Phaser 무관 |
| **테스트** | `src/logic/floorLevels.test.ts` | vitest — 방어/밴드/모드분리/스택피치 |
| **데이터** | `public/ui/floor-levels/` | `_index.json`·`README.md`. 에디터 산출 `floorLevels.json` 저장처 |
| **진입점** | `design/index.html`, `card-editor.html` 헤더 | 두 에디터 상호 링크 |

## 2. 좌표계 · 게임 정합 (SSOT 상수)

프레임 **1080×2400** (게임과 동일). 에디터 가이드가 아래 게임 상수를 그대로 표시:

| 상수 | 값 | 출처 |
|------|-----|------|
| `DARK_TOP` | 645 | 상점 하단 = 보드 암막 상단 (`PlayScene`) |
| 보드 영역 | left 55 · right 1025 · top 680 · bottom 1950 | `PlayScene` 카드 딜 영역 |
| STOCK/WASTE | (470,2140)/(640,2140) | `PlayScene` |

- **홈 밴드(`homeBand`)** = home 레이어(facade+character+glass) 요소들의 세로 합집합 bbox → **타워 스택 피치**로 자동 산출·export.

## 3. 데이터 스키마 (v2 · `floorLevelPack` — 1층=마스터 템플릿)

```jsonc
{
  "schemaVersion": 2, "kind": "floorLevelPack",
  "frame": { "w": 1080, "h": 2400 }, "buildingBottom": 645,
  "homeLayers": ["facade","roof","glass","character"],
  "playLayers": ["facade","roof","glass","character","interior"],
  "renderOrder": ["interior","facade","roof","character","glass"],
  "guides": { "v": [140, 940] },              // 건물 하단 좌우폭 세로 가이드(전 층 공유)
  "template": {                                // ★ 전 층 공유 위치·크기(1층 기준). 층마다 이미지만 교체
    "facade":   [ { "id":"e1","asset":"up_Solitaire_BG_01","x":540,"y":315,"w":1000,"h":660,"rot":0,"flipX":false } ],
    "roof":     [ { "id":"e2","asset":"up_Slitare_BG_roof","x":540,"y":120,"w":1040,"h":230,"rot":0,"flipX":false } ],
    "glass":    [ { "id":"e3","asset":"up_Slitare_BG_Glass","x":540,"y":470,"w":920,"h":150,"rot":0,"flipX":false } ],
    "interior": [ { "id":"e4","asset":"up_Solitaire_BG_Back01","x":540,"y":1522,"w":1080,"h":1755,"rot":0,"flipX":false } ]
  },
  "levels": [
    { "index":1,"id":"floor-001","name":"1층","theme":"bakery",
      "character":[ {"id":"c1","asset":"up_Solirare_Chr_01","x":540,"y":470,"w":300,"h":400,"rot":0,"flipX":false} ],
      "overrides":{} },
    { "index":2,"id":"floor-002","name":"2층","theme":"coffee",
      "character":[ … ],
      "overrides":{ "facade":{"e1":"up_Solitaire_BG_02"}, "interior":{"e4":"up_Slitare_BG_Back02"} } }  // 위치 동일, 이미지만 교체
  ]
}
```

- `asset` = `public/ui/uploads/<asset>.png` 파일 stem. `x,y` = **중심**, `w,h` = 표시 크기(프레임px).
- **template** 슬롯의 위치/크기는 전 층 공유. 층은 `overrides[layer][slotId] = asset` 로 **이미지만** 교체(없으면 슬롯 기본 asset).
- `facade` 하단은 항상 `buildingBottom`(645)에 정렬 → 전 층 건물 하단 동일.
- 단일 층 내보내기 = `kind:"floorLayout"`(template+override 해석본, `layers:{5개}`).

## 4. 게임 소비 계약 (다음 단계 — 배선 대기)

`floorLevels.ts` 가 렌더 계약을 제공하므로 씬 배선은 소량:

```
preload: this.load.json('floorPack', 'levels/floorLevels.json')
create:  const pack = coercePack(this.cache.json.get('floorPack'))   // { template, levels }

HomeScene (타워):
  const pitch = stackPitch(pack)                                    // = homeBand 높이(전 층 공유)
  pack.levels 를 아래→위로: 층 i 의 dy = (i - 0) * -pitch
  placementsForHome(pack, floor, dy) → this.add.image(x,y,asset).setDisplaySize(w,h)... (flipX→setFlipX)

PlayScene (플레이):
  placementsForPlay(pack, floor) → 전체 렌더(interior 뒤 → glass 최전면, 캐릭터는 유리 뒤)
  카드 보드는 기존대로 BOARD 영역(680~1950)에 딜 → interior 위·건물 하단(645) 아래.
```

> ⚠️ 배선은 `HomeScene.ts`/`PlayScene.ts` 를 실질 수정하므로 **저작 데이터가 생긴 뒤 + 사용자 리뷰 후** 착수 권장.
> 현재 게임은 `home.json`/`main.json`(phaser-ui-editor SSOT)로 동작 중 — floor-levels 는 **별개 데이터셋**이라 충돌 없음.

## 5. 에디터 UX 요약 (v2)

- **저작 = 플레이 화면 모사(기본)**: 캔버스가 실제 플레이 화면을 모사(게임 크롬 — 보드 암막·미리보기 카드·스톡/HUD). 그 위에 배치.
- **1층 = 마스터**: facade/roof/glass/interior 를 **1층에서 배치하면 전 층 동일 위치·크기**로 공유. 2층부터는 요소를 선택해 **이미지만 교체**(인스펙터 "이미지" → override). 위치·크기 편집은 전 층 공통.
- **건물 하단 자동 정렬**: facade 배치·이동 시 하단이 `buildingBottom`(645)에 스냅 → 전 층 건물 하단 동일 지점.
- **캐릭터는 유리 뒤**: 렌더 순서 `… character · glass(최전면)`.
- **모드 토글**: 🎴 플레이(저작) ↔ 🏢 타워 미리보기(모든 층 외관을 `homeBand` 피치로 세로 스택·클릭 전환).
- **가이드선(건물 하단 좌우폭 전용)**: 좌/우 러러에서 **끌어당겨** 세로 가이드 생성(전 층 공유·localStorage). 드래그 이동·프레임 밖/더블클릭 삭제·`가이드 지우기`. 요소 이동·리사이즈 시 **좌/중/우 모서리가 가이드에 스냅**. (불필요한 가이드 텍스트·가로 가이드·컨텍스트 라벨은 제거)
- **편집 안정화**: 배치 후 **자동 무장해제**(같은 이미지가 중복 배치되던 문제 해결). 8핸들 크기(비율고정 기본·Shift 자유)·회전·복제·z(맨앞/맨뒤)·좌우반전·방향키 nudge·수치 인스펙터.
- **레이어 패널**: 4카테고리 · 활성 선택 · 표시👁/잠금🔒 · 요소 수. 배지로 홈+플레이/플레이전용 표기.
- **팔레트**: uploads 실파일(카테고리별) + **📁 폴더 지정**(`showDirectoryPicker`, 미지원 시 `webkitdirectory` 폴백 → 폴더 내 이미지 재귀 로드) + 파일 드롭(파일명=키). 에셋 클릭 무장 → 캔버스 클릭 배치.
  - 폴더/드롭 이미지는 **📁 폴더** 카테고리에 모이고 objectURL 이라 **세션 한정** — 게임에서 실제로 쓰려면 해당 이미지를 `public/ui/uploads/` 로 복사(에셋 키=파일 stem 그대로 매칭).
- **조작**: 드래그 이동 · 8핸들 크기(회전보정·Shift 종횡비) · 회전핸들(스냅) · z(맨앞/맨뒤) · flip · 방향키 nudge · 복제/삭제. 인스펙터 수치 편집.
- **스냅**: 중앙선(540)·DARK_TOP·보드 경계·그리드.
- **층**: 새 층/복제/삭제 · 이름/테마 · localStorage 영속 · 이 층/전체 JSON.

## 6. 리스크 / 메모

1. **좌표 정합**: 에디터 가이드 상수 = 게임 상수. 게임 배선 시 `placementsFor*` 좌표를 프레임 그대로 써야 "에디터==게임".
2. **에셋 키 표기 혼재**: uploads 파일명이 `Slitare`/`Solitaire`/`Solirare` 혼재 → `asset`=파일 stem 그대로 저장(자동 접두 정규화 금지).
3. **타워 스택**: `homeBand`(자동 bbox)가 스택 피치. 층마다 밴드 높이가 다르면 피치도 층별 → 누적 오프셋으로 쌓기.
4. **별개 데이터셋**: 기존 `home.json`/`main.json` 을 건드리지 않음(디자이너 동시작업 안전).
