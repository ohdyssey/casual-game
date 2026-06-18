# Fishing Game

세로 모드 (720 × 1280) Phaser 3 + Vite 피싱 게임.  
독립 프로젝트 — `d:/Dev/fishing/`.

## 실행

```bash
npm install                  # 의존성 설치 (Phaser + Vite)
npm run dev                  # http://localhost:5175
npm run build                # 빌드
npm run preview              # 빌드 결과 미리보기
```

## 구조

```
d:/Dev/fishing/
├── index.html               포트레이트 메타 + 회전 가이드
├── vite.config.js           포트 5175
├── src/
│   ├── main.js              Phaser 부트스트랩 (720×1280, Scale.FIT)
│   ├── config/
│   │   ├── game.config.js   해상도·LAYOUT·COLORS·FISHING·FONT
│   │   └── fish.config.js   어종 7종 (정어리~황금잉어) + 깊이별 가중 선택
│   ├── scenes/
│   │   ├── BootScene.js     자산 로드 + URL 해시 라우팅 (#fishing, #shop 등)
│   │   ├── HomeScene.js     프로필 + 골드/젬 + 시작 버튼 + 하단 탭
│   │   ├── FishingScene.js  핵심 게임플레이 (캐스팅·릴링·캐치·타이머)
│   │   ├── ResultScene.js   매치 결과 + 잡은 어종 목록
│   │   ├── AlbumScene.js    도감 (잡은/미잡은 어종 표시)
│   │   └── ShopScene.js     장비 업그레이드 (낚싯대/미끼/줄)
│   ├── entities/
│   │   ├── Hook.js          낚싯바늘 상태 머신 (IDLE/DESCEND/REELING/HOOKED)
│   │   ├── Fish.js          개별 물고기 (좌우 헤엄 + 충돌 hit)
│   │   └── FishSpawner.js   깊이별 가중 스폰
│   ├── systems/
│   │   ├── UserProfile.js   localStorage 영구 데이터 (gold/gems/bestScore)
│   │   ├── FishInventory.js 도감 데이터 (어종별 잡은 횟수)
│   │   └── Equipment.js     장비 레벨 + 능력치 함수 (입질 윈도우/희귀도/수심)
│   └── ui/
│       └── components.js    strokeText, capsule, centerInBox, gradientFill
└── README.md
```

## 게임플레이 (현재 스캐폴드)

1. **HomeScene** → "낚시 시작" → `FishingScene`
2. **FishingScene**:
   - 화면 누름 → 훅 위로 (릴링)
   - 화면 뗌 → 훅 자유 낙하 (캐스팅)
   - 물고기 충돌 → 자동 hook → 수면까지 끌어올리면 캐치 완료
   - 60초 타이머 만료 → ResultScene
3. **ResultScene** → 다시 도전 / 홈으로

## 다음 작업 후보

- [ ] 캐릭터 PNG (낚시꾼) + 물고기 sprite 자산 제작
- [ ] 캐스팅 모션 (포물선) — 현재는 수직 낙하만
- [ ] 입질 윈도우 메카닉 — 충돌 후 일정 시간 안에 탭 필요
- [ ] 사운드 (배경 잔잔한 파도 + 입질 효과음)
- [ ] 배경 패럴랙스 (수면 잔물결, 깊은 바다 빛 광선)
- [ ] PM-tool 통합 (대시보드에서 메트릭 확인)

## 라우팅 (개발 편의)

URL 해시로 특정 씬 바로 진입:
- `#home`    → HomeScene
- `#fishing` → FishingScene
- `#result`  → ResultScene
- `#album`   → AlbumScene
- `#shop`    → ShopScene

## 디자인 토큰 / 핵심 상수

`src/config/game.config.js`:
- `GAME_WIDTH = 720`, `GAME_HEIGHT = 1280`
- `LAYOUT.outerPad = 24` — 좌/우/하단 외곽 패딩
- `LAYOUT.waterSurfaceY = 240` — 수면 라인 (배경 그라데이션 경계)
- `FISHING.hookDescendSpeed = 220` — 자유 낙하 속도 (px/s)
- `FISHING.hookReelSpeed = 320` — 탭 시 끌어올림 속도
- `FISHING.matchDurationSec = 60` — 한 매치 길이
