# 슬롯매치 (SocialCasino)

퍼즐 + 슬롯 하이브리드 **소셜 퍼즐슬롯** 게임. 하단 **매치-3 보드**에서 3매치를 만들면 스핀이 적립되고(`MATCH = 1 SPIN`), 상단 **슬롯머신(5릴×3행)** 을 돌려 코인·잭팟을 노린다. 매치가 스핀의 연료, 슬롯이 보상 루프. 소셜 요소(TOP SPINNERS 랭킹·INVITE·잭팟 게이지)와 베팅 배율을 얹는다.

- 허브 id: `socialcasino` · dev 포트 **6207** · genre `puzzle` · accent `#9B5DE5`
- 디자인 프레임: **1080 × 2400 HD 세로**(형제 ZombieArrow/Logistics 와 동일). `designWidth: 1080`, `designHeight: 2400`.
- 형제 게임과 동일한 기술 기반: **Phaser 3.90 + TS + `@casual/core` 셸 + phaser-ui-editor SSOT**.

## 개발

```bash
# 루트에서
npm run dev:socialcasino      # vite dev (포트 6207)
npm run build:socialcasino    # 프로덕션 빌드 → dist/
```

브라우저: <http://localhost:6207/>

> 허브(`npm run dev`)에서 카드 클릭으로도 온디맨드 기동된다(현재 `live:false` 라 준비중 표시 — 에셋/로직 완료 후 `games.config.js` 에서 `live:true` 로 전환).

## 에셋 디자인 (진행 중)

phaser-ui-editor 로 이 폴더를 열어 작업한다(auto-adopt, `phaser-ui-editor.project.js`). 현재 디자이너가 작업 중인 화면(`public/ui/layouts/_index.json`):

| 화면 | 파일 | 용도 |
|------|------|------|
| 진입화면 | `blank.json` | 스플래시 / 시작 |
| 로비 | `blank_2.json` | **메인 플레이**(슬롯머신 + 매치보드 + 파워업 + 베팅) |
| 팝업화면 | `blank_copy.json` | 일반 팝업 |
| 광고 보상 제안 | `popup_ad_3.json` | 리워드 광고 오퍼 |

- 저장본: `public/ui/layouts/*.json`(레이아웃, SSOT) · `public/ui/uploads/*`(이미지, 키 접두 `up_SC_`) · `public/ui-assets.json`(매니페스트).
- 업로드 예시(이미 적재됨): `up_SC_Slot_01-1_v2`(슬롯머신 본체).

자세한 사양: [`ASSETS.md`](./ASSETS.md) · 시각 보드: [`design/index.html`](./design/index.html).

## 게임 규칙 (1차 구현 완료)

1. **매치 → 스핀**: 하단 매치-3 보드에서 인접 타일을 탭-스왑 → 3개 이상 매치. **매치(run) 1개당 상단 슬롯 스핀 1회** 적립(연쇄 cascade 포함 누적).
2. **콤보 → 베팅 배수**: 매치 크기(3=×1 · 4=×2 · 5=×3 · 6+=×5)와 연쇄 깊이가 **베팅 배수**를 키운다(상한 ×10). 큰 콤보일수록 슬롯에 **더 큰 금액으로 베팅** → 배당도 커짐.
3. **클래식 슬롯**: SPIN 버튼/레버 → 적립 스핀을 순차 회전(5릴×3행, 고정 5라인: 중·상·하·V·^). 왼쪽 릴부터 연속 동일 심볼 3+개면 당첨 = `paytable × bet × 배수`. 8심볼, 고가치 심볼일수록 희귀.
4. **잭팟**: 스핀마다 게이지 +1, 가득 차면(0/10) 잭팟 보너스(`bet × 100`) 후 리셋.
5. **베팅 바**: −/＋ 로 기본 베팅(100~5,000) 조절, MAX BET.

> 순수 로직은 `src/logic/*` + vitest(20 테스트), 연출은 `src/ui/*View.ts` 가 담당(로직/뷰 분리).

## 구조

```
index.html                  게임 진입(/src/main.ts 부팅)
design/index.html           에셋 디자인 보드(무빌드, 디자이너용)
ASSETS.md                   에셋 사양(버전관리 사본)
phaser-ui-editor.project.js 에디터 auto-adopt 계약
src/
  main.ts                   createCasualGame(SocialCasinoGame)
  game.ts                   GameModule 정의(1080×2400)
  assets.ts                 레이아웃/매니페스트 로드 + 심볼/타일 카탈로그(게임플레이 텍스처는 직접 로드)
  scenes/PlayScene.ts       오케스트레이션 — 크롬 렌더 + 보드/슬롯 + 게임 루프 + HUD/베팅/잭팟
  logic/
    rng.ts                  결정적 RNG(시드, 테스트 재현)
    board.ts                매치-3 순수 로직(매치·연쇄·스핀/배수 산정) + board.test.ts
    slot.ts                 클래식 슬롯 순수 로직(릴·페이라인·배당) + slot.test.ts
  ui/
    layoutLoader.ts         레이아웃 JSON → Phaser 객체(skip 술어로 동적 노드 제외)
    layoutGeom.ts           레이아웃에서 릴 격자/보드 영역/버튼 앵커 추출
    slotView.ts             5×3 릴 뷰 + 스핀 애니메이션 + 당첨 플래시
    boardView.ts            매치-3 뷰 + 탭-스왑 입력 + 연쇄 애니메이션
public/
  ui/layouts/main.json      화면 레이아웃(에디터 SSOT, 디자이너 저작)
  ui/uploads/               업로드 이미지(up_SC_*) — Symbol_01~08, Puzzle_01~06 등
  ui-assets.json            매니페스트(키→경로)
  loading/                  bg/logo/start_on/start_off (로딩 화면 에셋, 예정)
```

## 다음 단계

1. **파워업 4종**(아이템1~4): 망치/로우블래스트/스왑/컬러밤 동작 배선(현재 정적 아트).
2. **경제 연동**: 로컬 코인 → 허브 liveops 지갑(`@casual/core/liveops`) 연결, 잔액 가드.
3. **베팅 히트존 정렬**: 베팅 바 −/＋/MAX 위치를 아트 버튼에 정밀 맞춤(현재 근사 좌표).
4. **연출 보강**: 페이라인 라인 그리기, 잭팟/대박 파티클, 사운드팩, 교착 시 보드 셔플(`hasAnyMove`).
5. **로딩 화면** + 허브 `games.config.js` `socialcasino` → `live:true` 전환(dev/배포 매핑은 이미 배선됨).
