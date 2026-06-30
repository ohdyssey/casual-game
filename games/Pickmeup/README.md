# 픽미업 (Pick Me Up!)

색 정렬 주차장 퍼즐 — 보드의 색깔 차량을 탭해 같은 색 **픽업 슬롯**으로 보내고, 버스를 같은 색으로 채워 출발(승객 픽업)시킨다. 슬롯 수 제한이 곧 난이도. 보드를 다 비우면 클리어.

- 허브 id: `pickmeup` · dev 포트 **6206** · genre `puzzle` · accent `#E5703A`
- 형제 게임(PawLink/PathRush)과 동일한 기술 기반: **Phaser 3.90 + TS + `@casual/core` 셸 + phaser-ui-editor SSOT**.

## 개발

```bash
# 루트에서
npm run dev:pickmeup      # vite dev (포트 6206)
npm run build:pickmeup    # 프로덕션 빌드 → dist/
```

브라우저: <http://localhost:6206/>

## 에셋 디자인 (지금 착수 가능)

1. **[`design/index.html`](./design/index.html)** 를 열어 화면 청사진·색 카탈로그·에셋 체크리스트 확인.
2. 이미지 제작 → **phaser-ui-editor** 로 이 폴더를 열어 업로드·배치(auto-adopt, `phaser-ui-editor.project.js`).
   - 저장본: `public/ui/layouts/main.json`(레이아웃, SSOT) · `public/ui/uploads/*`(이미지) · `public/ui-assets.json`(매니페스트).
3. dev 서버 새로고침으로 즉시 반영. 레이아웃이 비어 있는 동안은 게임이 **라벨 플레이스홀더 화면**을 보여준다(부팅 OK).

자세한 사양: [`ASSETS.md`](./ASSETS.md).

## 구조

```
index.html                  게임 진입(/src/main.ts 부팅)
design/index.html           ⭐ 에셋 디자인 보드(무빌드, 디자이너용)
ASSETS.md                   에셋 사양(버전관리 사본)
phaser-ui-editor.project.js 에디터 auto-adopt 계약
src/
  main.ts                   createCasualGame(PickmeupGame)
  game.ts                   GameModule 정의
  assets.ts                 레이아웃/매니페스트 로드 + 색 카탈로그 키
  scenes/PlayScene.ts       레이아웃 렌더 or 플레이스홀더(현재 스캐폴드)
  ui/layoutLoader.ts        main.json → Phaser 객체(SSOT 렌더, 형제 게임 계승)
public/
  ui/layouts/main.json      화면 레이아웃(에디터 저작)
  ui/uploads/               업로드 이미지
  ui-assets.json            매니페스트(키→경로)
  loading/                  bg/logo/start_on/start_off (로딩 화면 에셋)
```

## 다음 단계(에셋 확정 후)

- `src/logic/*` 순수 모듈 + vitest 로 게임 로직 구현(차량 탭→슬롯 이동, 버스 채움→출발, 보드 비우기, 부스터 4종).
- 로딩 에셋 준비되면 `game.ts` 의 `scenes` 앞에 `makePortalLoading({...})` 펼쳐 붙이기(형제 게임 패턴).
- 허브 `games.config.js` 의 `pickmeup` 을 `live:true` 로 전환 + on-demand/배포 매핑은 이미 배선됨.
