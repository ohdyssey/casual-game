# 코드 리뷰 결과 — 2026-06-06

6차원 병렬 리뷰 + 적대적 검증으로 전체 코드베이스(43파일/14,769줄)를 점검했다.
**확정 36건**(원시 59건 중 23건은 오탐으로 제거) → **30건 즉시 수정 완료**, **6건 구조 리팩터로 보류**.

## 수정 완료 (30건) — 이 커밋에 반영

| 심각도 | 건수 | 핵심 |
|--------|------|------|
| HIGH | 1 | PH-01 `fish_strike_timeout` 리스너 매치마다 누적 → named handler + `_shutdown` off |
| MEDIUM | 13 | 경제(캐스트 비용 미강제 BUG-01·콤보 무한배수 BUG-05·구매 비원자성 STATE-01), 영속성 검증(SEC-06/STATE-04/07), Music 크로스페이드 누수(PH-04), 디버그툴 프로덕션 노출(ARCH-03), 소스맵/dev host(SEC-01/02), 카우스틱 텍스처 재생성(perf-02) 등 |
| LOW | 16 | 입질 게이트(BUG-02), 영속성 타입가드(STATE-03/06/10), 라벨측정 캐시(perf-07), `_drawHook` 중복(perf-01), 매직넘버→config(ARCH-04), main.js 리스너(PH-08) 등 |

> 적대적 재검증에서 발견된 회귀 1건(Music `_clearPendingFades` 가 페이드 사운드를 dispose 안 함)은 동일 커밋에서 수정함.

## 보류 (6건) — 별도 작업 필요

테스트가 없는 상태에서 일괄 자동수행 시 회귀 위험이 커, 의도적으로 분리한다.

### 1. ARCH-01 — `FishingScene.js` 2821줄 분할 (최우선 구조부채)
800줄 제한을 3.5배 초과한 god-object. 리뷰어 제안 분해:
- `WaterFxLayer` (카우스틱/버블/시머 + 절차적 텍스처 + `_updateWaterSurface`) ~250줄
- `FishingHud` (top row / second row / sound toggle / `_updateHUD`) ~200줄
- `CraftPanel` (`_buildCraft*` / `_toggleCraftSelect` / `_craftCreate`) ~200줄
- `FishGaugeOverlay` (`_buildFishGauges` / `_drawFishGauge`)
- 배경/해파리 빌더(`_buildBackground` / `_buildJellyfish` / `_applyDepthVisual`)

### 2. ARCH-02 — `update()` ~300줄·5중첩 분할
명명된 단계로 분리: `_updateAudioState` / `_updateNeedle` / `_updateReelCameraShake` / `_detectHookAttach` / `_updateHookedFishVisual`(user2 vs auto ~90줄) / `_updateShowcase`. 1850–1939의 5중첩 평탄화.

### 3. ARCH-10 — `Hook.js`(981) / `Fish.js`(900) 분할
각 파일이 다중 상태머신을 한 클래스에 담음 → 상태머신/물리/렌더 분리.

### 4. ARCH-06 — private 필드 교차참조 결합 제거
`hook._tensionLevel` / `hook._strugglePhase` / `fish._fleeDirX` / `hook.targetedBy` 등 경계 넘는 직접 접근 → 공개 접근자/이벤트로.

### 5. ARCH-09 — catch-완료 / struggle-실패 경로 중복(~20줄) 제거
성공/실패 teardown 로직이 복붙되어 수동으로 lockstep 유지 중 → 공통 `_endEncounter()` 추출.

### 6. SEC-03 — 에디터 패키지 업로드 파일명 새니타이즈 강화 (★ fishing 아님)
`@ohdyssey/phaser-ui-editor` 의 `src/vite/plugins.js` — traversal 은 막혀 있으나 단일 가드 의존이 취약. **에디터 repo(`d:/Dev/phaser-ui-editor`)에서 수정**해야 함(node_modules 직접수정 금지).

## 권장 선행작업
구조 분할(ARCH-01/02/10) **이전에 게임 로직 단위 테스트**를 얇게라도 추가할 것 — 경제 루프(캐스트 비용/콤보 상한), 3:1 파이팅 불변식(`game.config.js` `FISHING.fight`), 영속성 sanitize 를 회귀 그물로 보호한 뒤 god-object 를 분해하면 안전하다. (현재 게임 로직 테스트 0건.)
