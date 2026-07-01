# 3릴 슬롯 재설계 (MATCHSLOT CITY → 코인마스터형)

> 작성 2026-07-02. 기존 5릴/5페이라인 퍼즐-슬롯을 **3릴×3행 심플 슬롯 + 코인마스터식 어택/레이드**로 재설계.
> 지시 근거: 디자이너 목업 `public/ui/layouts/main_copy.json`("메인게임화면") + PO 이미지 주석.

## 0. 확정된 설계 결정 (2026-07-02 PO 승인)

| # | 결정 | 값 |
|---|---|---|
| 1 | 슬롯 판정 라인 | **가운데 1줄만** — 3릴×3행 표시, 중앙 3칸 동일 시에만 보상 |
| 2 | 어택/레이드 트리거 | **슬롯으로 완전 이전** — 퍼즐 매치=스핀(연료)만, 보드 스페셜 젬(SPECIAL_ATTACK/RAID) 제거 |
| 3 | 스핀 "250/50" | **코인마스터식 재생** — 50=레벨 재생상한(시간당 자동충전), 250=현재 보유(상한 초과 가능) |
| 4 | EARN SPINS 미션 게이지 | **유지** — 스핀 획득처로 존치(새 화면 배치는 구현 시 결정) |

### 슬롯 규칙 (확정)
- 중앙 3칸(=`reels[c][1]`, c=0..2)이 **모두 동일 심볼**일 때만 보상. 상/하단 줄은 연출용.
- 망치(`up_NewUI_SlotSymbol_08`, 심볼 index 7) 3매치 → **ATTACK**
- 금화(`up_NewUI_SlotSymbol_04`, 심볼 index 3) 3매치 → **RAID**
- 그 외 심볼 3매치 → **골드 보상**(심볼 배수 × bet), 정확한 금액은 econ 콘솔로 추가 보정
- 미매치 → 보상 없음
- 퍼즐 매치 → 슬롯 회전 루프는 유지(연료). PLAY 버튼 없음, 레버 유지.

## 1. 현재 구조 요약 (매핑 결과)

- **PlayScene**(1870줄) 이 `main.json`(구버전, 에디터 카탈로그에서 빠짐)을 SSOT 로 렌더.
- **슬롯**: `slot.ts` = 5릴×3행 5페이라인, 심볼 `up_Gem_T01_SLOT_01..08`.
- **보드**: `board.ts`/`boardView.ts` = 매치-3(rows/cols 파라미터화됨), 타일 `up_Gem_T01_01..07`.
- **어택/레이드(핵심 재사용)**: 현재 **보드 스페셜 젬** → `PlayScene.onStageTrigger(steps,combo)` → `stageHold{type,power}` → `finalizeWin` 에서 `pendingStage` 승격 → `maybeEnterStage()` → `scene.launch('hammerfx',{type,mult,x,y})` → 커튼 후 `scene.launch('stage1',{type,power,bet:stake,resumeKey,skipReveal,auto})`.
- **다운스트림(그대로 재사용)**: `HammerFxScene`(망치/커튼 컷신), `attackBanner.ts`, `Stage1Scene`(어택=가구 다운그레이드 / 레이드=룰렛 코인), `HotelScene`(호텔 건설), `hotelUpgrade.ts`/`progression.ts`.
- **핸드오프 계약**: `PlayScene.awardRaidWin(coins)` / `awardAttackSpins(spins)` / `returnFromStage()` 를 Stage1Scene 이 직접 호출.
- **경제**: `wallet.ts`(코인) · `playerState.ts`(spins/betIndex/jackpotPool) · `gems.ts` · `profile.ts` (전부 localStorage). `playParams.ts` = BET_LADDER/START_SPINS/스케일 SSOT. `economy.ts`/`econOverrides.ts` = RTP/보상. `src/econ/` = 밸런싱 대시보드+시뮬(6×6/5라인 하드코딩 → 갱신 필요).

## 2. 재설계 = "트리거 소스 이동 + 슬롯 교체 + 레이아웃 채용"

메타(어택/레이드/호텔)는 완성돼 있으므로 **다운스트림은 건드리지 않는다.** 변경점:

### A. 신규 순수 로직 (완료: `src/logic/slot3.ts` + `slot3.test.ts`)
- 3릴×3행, 중앙 1줄 판정, `SpinOutcome{ reels, matched, symbol, kind:'none'|'coin'|'attack'|'raid', coinBase }`.
- `GOLD_SYMBOL=3`, `HAMMER_SYMBOL=7`. 가중치/코인배수는 초기값(econ 튜닝 대상).

### B. 슬롯 뷰 (`slotView.ts` → 3릴 지원)
- `slotView`는 `REEL_COLS/ROWS`를 `slot.ts`에서 import → **`slot3.ts`로 교체 시 3릴 자동 반영**.
- `flashWins()`의 하드코딩 5라인표(`PAYLINES_ROWS`) 제거 → 중앙줄 강조 + kind별 분기(coin=코인버스트 / attack·hammer=망치연출 / raid=룰렛 예고).
- 심볼 텍스처 `SLOT_SYMBOL_KEYS` → `up_NewUI_SlotSymbol_01..08` 로 리포인트(assets.ts).
- 신규 파일 권장: `slotView3.ts`(구 slotView 보존) 또는 slotView 파라미터화.

### C. 트리거 이동 (`PlayScene`)
- `board.ts`의 `SPECIAL_ATTACK/RAID` 젬 트리거(`onStageTrigger`/`onCollectSpecials`의 attack/raid 경로) 제거.
  - **spin 젬(SPECIAL_SPIN)은 유지 가능** (매치→스핀 연료) — 결정4(미션 유지)와 정합.
- 신규 `onSlotOutcome(outcome, bet)`:
  - `kind==='attack'` → `stageHold={type:'attack', power: bet × attackSpinStakeScaleNow()}` → 기존 `maybeEnterStage()` 경로 그대로.
  - `kind==='raid'` → `stageHold={type:'raid', power: bet × incomeMultNow() × raidStakeScaleNow()}`.
  - `kind==='coin'` → `coinBase × bet × incomeMultNow()` 코인 지급(기존 finalizeWin 코인연출 재사용).
  - `kind==='none'` → 무보상.
- `maybeEnterStage()`/`hammerfx`/`stage1` 시퀀싱은 **불변**.

### D. 레이아웃 SSOT 교체 (`main.json` → `main_copy.json`)
- `assets.ts`: 신규 `MAIN_LAYOUT_KEY/PATH = 'ui/layouts/main_copy.json'`(구 상수 보존).
- `layoutGeom.ts`:
  - `reelGrid()` 5×3 → 3×3 (또는 `main_copy` `2.5D 영역` 노드에서 3열 파생).
  - `boardGeom()` — `패널` 이름 매치는 이미 동작(`up_NewUI_02`). `PANEL_GRID` 6×6 하드코딩 → **파라미터화(6→7→8 전환)** + `up_NewUI_02` 프레임 재측정. 목업 셀 피치 146×146, 원점(177,1216).
  - `isDynamicNode()` 스킵 접두 추가: `up_NewUI_SlotSymbol_`, `up_NewUI_02-1`, `up_NewUI_Puzzle_` (또는 `group==='grp_8'`).
  - `computeGeom()` 앵커 픽리스트 → `up_NewUI_*` 로 재매핑(고패널/스핀게이지/헤더/메뉴).
- `HammerFxScene`: 망치/커튼 좌표를 `main_copy.json`에서 읽도록 리포인트.

### E. 헤더/좌우/하단 메뉴 (로비 패턴 재사용)
- `main_copy.json`의 grp_4(헤더)/grp_5(우메뉴)/grp_6(좌메뉴)/grp_2(하단 메뉴바) 노드를 `buildLayout`으로 렌더 + `entries().find()` 로 버튼 배선(LobbyScene 패턴).
- 헤더 텍스트 정렬은 `styleHeaderTexts()` 재사용. 코인 `layer_20`("123,456,789,000"), 스타 `layer_18`("256").
- 하단: 홈(05-1)/마이호텔(05-2)/카드(05-3)/친구(05-4), 우: 일일리그(07-1)+3, 좌: 아이템샵(07-5)+3.

### F. 스핀 홀딩 250/50 + 베팅 10 (신규)
- 코인마스터식 재생 모델: `playParams.ts`에 `spinRegenCap(level)`(기본 50) + 재생틱(시간기반) 신설. `playerState`에 `spins`(현재) + `lastRegenAt` 추가.
- `layer_10`("250/50") = `현재/재생상한`, `layer_10_copy`("10") = bet(BET_LADDER, 기본 10). 둘 다 **plain Text** 바인딩(구 이미지숫자 렌더러 폐기).
- 상단 스핀게이지 바(`up_NewUI_06-2/06-3`) = 현재/상한 비율 표시.

### G. 미션 게이지 유지 (결정4)
- `RewardGaugeView`/미션 로직 존치. `main_copy`엔 중앙 미션 클러스터가 없으므로 배치 위치 확정 필요(슬롯게이지 영역 재사용 or 디자이너에 노드 요청).

## 3. 보관(아카이브) 방식 — **PO 확인 대기**

git 은 커밋 1개(`1차 MVP`)뿐이고 현재 실행 게임은 **미커밋 워킹트리**. 선택지:
- (A) 현재 WIP 를 브랜치+커밋 후 태그 `archive/matchslot-city-v1` → 재설계는 새 브랜치. (권장, 완전 복구 가능)
- (B) 갈라지는 파일만 `*.legacy.ts` 로 복제, 커밋 없이 진행.
- (C) 피처 플래그로 구/신 씬 토글.

순수 로직(slot3)·문서는 신규 파일이라 **현재 게임에 무영향** — 아카이브 결정 전에도 안전하게 선행.

## 4. 단계별 로드맵

- [x] **P0** 매핑 + 설계 확정 + `slot3.ts`/`slot3.test.ts`(순수 로직·TDD 12통과)
- [x] **P1** 아카이브(git 태그 `archive/matchslot-city-v1` + 브랜치 `redesign/3reel-slot`) + `assets.ts` 카탈로그 리포인트(`up_NewUI_SlotSymbol_*`/`up_NewUI_Puzzle_*`) + `UI_LAYOUT_PATH`→main_copy
- [x] **P2** `layoutGeom.ts` reelGrid 3×3(심볼군집+field 클립)·boardGeom N×N 파라미터화·PANEL_GRID 재측정·`isDynamicNode` 신 접두
- [x] **P3** `slotView` slot3 전환 + spin(rng,weights,pace) + 중앙 1줄 flashWins(kind 틴트)
- [x] **P4** PlayScene: showSlotResult(outcome) 재작성(망치=어택·금화=레이드·그외=골드) + 트리거 슬롯 이전(onStageTrigger no-op) + 죽은 import 정리. **typecheck·build·test 그린, 부팅 경로 무크래시 확인**
- [ ] **P5** (다음) 침습 리와이어 마감 — 아래 §5 발견 갭:
  - 헤더 이중화 제거(main_copy grp_4 헤더 vs 코드 `buildHudHeader` 바 택1) + 좌/우/하단 메뉴(`up_NewUI_05/07-*`) 버튼 배선(로비 패턴)
  - 스핀 카운트 표시 재배선('Spin Num'→main_copy `250/50` layer_10) + bet '10'(layer_10_copy) plain-text 바인딩 + 구 이미지숫자 렌더러 정리
  - **250/50 코인마스터식 재생**: `playParams.spinRegenCap(level)` + `playerState.lastRegenAt` + 시간충전 틱
  - 미션게이지(유지 결정) **배치**: main_copy엔 게이지 노드 없음 → 슬롯게이지 영역 재사용 or 디자이너 노드 요청(현재 inert)
  - 보드 어택/레이드 스페셜 젬 **스폰 비활성**(스핀 젬만) — 죽은 젬 제거
- [ ] **P6** HammerFxScene 좌표 main_copy 리포인트 + `src/econ/sim` 3릴/보드 param 갱신 + 승률/RTP 밸런싱(WEIGHTS·coinBase)
- [ ] **P7** headless 부팅·플레이 검증(스크린샷) + 사운드팩(public/sfx 신규) 배선

## 5. P4 후 발견된 리와이어 갭(부팅은 되나 미완 — P5 대상)
- **헤더 이중**: `buildHudHeader`(up_SC_UI_42-1_v8 코드바)가 main_copy grp_4 헤더 아트 위에 겹쳐 그림 → 택1 필요.
- **스핀 카운트 미표시**: 구 'Spin Num' 노드가 main_copy에 없어 `spinText` undefined(가드로 무크래시). `250/50`/`10` 텍스트 노드에 재바인딩 필요.
- **미션게이지 inert**: `up_SC_UI_53`(fillBar) 부재 → `buildGaugeView` undefined 반환 → 게이지 미표시(로직은 보존). 배치 결정 필요.
- **HammerFx 좌표**: 커튼/망치 노드는 main_copy에 있음(스킵 처리됨). HammerFxScene 자체 좌표 소스 확인/리포인트(P6).
