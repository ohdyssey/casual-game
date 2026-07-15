# 솔리테어 하이츠 (Solitaire Heights)

탑 쌓기형 캐주얼 솔리테어. 규칙은 **TriPeaks(트라이픽스) + ±1 랭크 + 순환(A↔K)**.
위쪽 피크 카드 배열에서 웨이스트(폐기) 최상단과 랭크가 ±1(순환 포함)인 **노출된** 카드를 탭해 제거하고,
보드를 다 비우면 그 **층**을 클리어 → 타워를 위로 쌓아 올린다(홈 = 타워 레벨맵, 이미지1).

## 개발
```bash
npm run dev:solitaire     # http://localhost:6209
npm run build:solitaire
npm run test              # src/logic/*.test.ts (repo 루트 vitest)
npx tsc -p games/Solitare/tsconfig.json
```

## 구조
```
src/
├── main.ts / game.ts        # 코어 셸 부팅 + GameModule(HD 1080×2400)
├── assets.ts                # 에디터 SSOT 로드 + 카드/배경 텍스처 키 계약
├── ui/layoutLoader.ts       # main.json/home.json → Phaser (image/rect/text)
├── scenes/
│   ├── HomeScene.ts         # 타워 레벨맵(플레이스홀더)
│   ├── PlayScene.ts         # 본편(엔진 구동, 코드 드로우 카드)
│   └── cardView.ts          # 코드 드로우 카드 앞/뒷면
└── logic/                   # 순수 엔진(Phaser-free) + vitest
    ├── types.ts             # Card/Rank/Suit, rankAdjacent(±1 순환)
    ├── deck.ts              # 52장 덱 + 시드 셔플(mulberry32)
    ├── layouts.ts           # 피크 레이아웃(CLASSIC_TRIPEAKS = 3피크 28장)
    ├── tripeaks.ts          # deal/isExposed/isPlayable/playCard/drawStock/isWin/hasMove
    ├── solvable.ts          # isWinnable(DFS) + dealWinnable(승리 가능 딜 보장)
    └── levels.ts            # 층(레벨) 커브 + 상점 테마(FLOORS)
```

## 현재 단계
**기초 제작(엔진 + 플레이스홀더 + 허브 등록)**. 카드/배경은 정식 에셋 전까지 코드 드로우.
화면 배치의 SSOT 는 phaser-ui-editor → `public/ui/layouts/{main,home}.json`.

## 다음 단계
1. 정식 카드/배경/타워 에셋을 에디터로 업로드(`ASSETS.md` · `design/index.html` 사양) → main.json/home.json 저작.
2. `public/loading/{bg,logo,start_on,start_off}.png` 준비 후 `game.ts` 의 `makePortalLoading` TODO 배선.
3. 허브 `games.config.js` 의 `solitaire` 를 `live:true` 로(키아트 WebP 교체 + PLAY_OPEN_GAMES 는 이미 등록됨).
