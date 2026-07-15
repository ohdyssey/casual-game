# card-levels — Solitaire 카드 레벨 데이터

이 폴더는 **Solitaire 게임 전용** 카드 배치 데이터입니다. 카드 레벨 저작 툴(에디터 `phaser-ui-editor`의 카드레벨 모드)이 이곳을 읽고 씁니다.

## 구조

```
public/ui/card-levels/
  templates/            # 배치 양식(손 저작 배열 스냅샷, CardBoard 스키마)
    triple-peak.json      # 삼봉 — 좌·우 상단 봉우리 + 중앙 하단 봉우리 (30장)
    fan-columns-arc.json  # 부채꼴 7컬럼 아크 (21장)
    brick-wall-3.json     # 3열 캐스케이드 벽 (18장)
  _index.json           # 레벨 인덱스 { "levels": [ {id,name,budget,state} ] }
  level-0001.recipe.json  # (예정) 생성된 레벨 = { templateId, variation, seed }
  level-0007.board.json   # (예정) 손 보정된 explicit CardBoard
```

## 계약

- **CardBoard 스키마**: 각 슬롯 `{ id, pile, x, y, layer, face }`. 가림(coveredBy)은 **겹침 × 레이어에서 유도**(저장 안 함).
- **좌표계**: 세로 프레임 1080×2400, 카드 132×182. 배치는 `playZone`(화면 가운데 밴드, 상단 상점/HUD·하단 뽑기 제외) 안에만.
- **값·아트는 저장하지 않음** — 카드 값은 게임이 딜 때 배정.
- 설계 문서: `Solitare/docs/CARD_LEVEL_TOOL_PLAN.md` (이 게임 프로젝트 안에 있음).

## 구분

- **툴 코드**(CardLevelScene, coverGraph, solvable, geom, generateLevels)는 에디터 저장소 `phaser-ui-editor`에 있습니다 — 모든 게임이 공유하는 범용 기능이므로.
- **이 데이터**(templates·levels)는 Solitaire 전용이라 이 게임 프로젝트에 있습니다.
- 게임 소비(예정, P5): `src/logic/levels.ts`의 `levelDef(lv)`가 recipe면 생성기로 전개, baked면 직접 로드 → `dealWinnable(board)`.
