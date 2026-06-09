# 캐쥬얼게임 플랫폼 — 마스터 플랜 (CEO 리뷰 + 외부검증 반영 최종본)

> 피싱게임(`D:\Dev\fishing`)의 **검증된 ~25% 유틸**(scale/popup/audio/pwa)을 토대로,
> **2개 게임을 인터리브로 만들며** 공용 코어를 수확하는 **TypeScript 모노레포** 플랫폼.
> 첫 게임: **열정편의점**(진열 정렬), 2번째 인터리브: **AquaSlot 워터소트**.

작성 2026-06-02 · 대상 `d:\Dev\CasualGame` · 모드: SELECTIVE EXPANSION
리뷰: `/plan-ceo-review` + 외부검증(architect) 완료 (결정 D1~D11)

---

## 0. 확정 결정

| # | 결정 | 선택 |
|---|------|------|
| D1 | 구현 순서 | bottom-up. **D10으로 정밀화** → 2게임 인터리브. |
| D2 | 리뷰 모드 | 선택적 확장 (7종 기준선 + 고레버리지 확장 체리픽) |
| D3 | LiveOps 메타 | 범위 추가하되 **P1은 파일럿-로컬**, 2소비자 후 코어 hoist (D10) |
| D4 | 분석+원격설정 | 범위 추가, D3와 동일하게 파일럿-로컬 → hoist |
| D5 | TypeScript | 범위 추가 |
| D6 | 스캐폴딩 CLI | TODOS (P2 후) |
| D7 | 앵커 레이아웃 | TODOS. **단 grid 게임용 `gridLayout()`은 P1에 즉시**(H4) |
| D8 | 테스트 | 코어 **순수 상태머신** Vitest 80%+ (M1: 씬-프리 추출 후) |
| D9 | 배포 | 게임별 독립 빌드. **코어=TS 소스 path alias, Phaser 워크스페이스 루트 정확버전 단일**(H2/H3) |
| **D10** | **fork 해소** | **파일럿 + watersort 인터리브, 메타 파일럿-로컬, game2는 복붙 금지·코어 import 강제** |
| **D11** | **정확성 보정** | **재사용 ~25%(60% 아님), LiveOps=신규, 지갑 origin별 분리 명시, 상태머신 테스트** |

---

## 1. 비전 / 목표

7종 하이퍼캐주얼 퍼즐을 양산하되, **코어를 단일 게임에서 추측하지 않는다.** 2개 게임을
인터리브로 만들며 *실제로 공유되는 것만* 코어로 수확한다. 전략적 목표(0A): "7개를 똑같이"가
아니라 **"분석 무장 포트폴리오에서 히트작을 빨리 찾기"** → 메타(D3)+계측(D4)이 그래서 들어간다.

- **성공 기준**: 코어 동결(P2) 후 게임 추가 = GameplayScene + config + 에셋 매핑.
- **fork 방지(D10)**: game2(watersort)는 **파일럿 파일 복붙 금지**. `@casual/core` import가 강제. 코어가 비면 game2가 안 굴러감 → 수확이 구조적 필수.

---

## 2. 제품 범위 — 8 컨셉 → 7 게임 + 1 메타

| # | 게임 | 장르 | 핵심 로직 | 단계 |
|---|------|------|------|:--:|
| 6 | **열정편의점** ★1번째 | 진열 정렬 | 상품 탭→빈 칸, 콤보, 타이머 | P1 |
| 1 | **AquaSlot** ★2번째(인터리브) | 워터소트 | 병 탭→따르기, 색 분류 | P1↔P2 |
| 4 | FishyMatch | 매치-3 | 인접 스왑 | P3 |
| 7 | 오마카세매치 | 타일 커넥트 | 경로 연결(BFS) | P3 |
| 2 | BubblePong | 버블 슈터 | 조준 발사 | P4 |
| 3 | ColorSplash | 슬라이스 | 스와이프 콤보 | P4 |
| 5 | 꼬치왕 | 트레이 정렬 | 재료 서빙 | P4 |
| — | AD Spin | 룰렛 보상 | → 메타 `SpinWheel`로 흡수 | P2 hoist |

---

## 3. 아키텍처 — TypeScript 모노레포 + 공용 코어

```
d:\Dev\CasualGame\
├── package.json                 # npm workspaces. Phaser=정확버전 단일 의존(H3)
├── tsconfig.base.json           # path alias @core/* (코어=TS 소스, 빌드 단계 없음, H2)
├── packages/core/               # @casual/core — TS 소스 라이브러리(게임이 import)
│   ├── scale/  ui/  systems/     # ★피싱에서 실제 재사용(~25%): scale·popup·components·audio·haptics·pwa
│   ├── save/                     # SaveStore(네임스페이스 <gameId>_v1). ※origin별 분리(H5)
│   ├── liveops/                  # ★P2 hoist 대상(P1엔 비어있음). Shop 구매로직은 신규(C2)
│   ├── analytics/                # ★P2 hoist 대상
│   ├── layout/                   # gridLayout() 등(P1에서 grid 헬퍼 시작, H4)
│   └── game-shell/               # GameModule 계약(P2 동결). 라우팅도 P2까지 게임-로컬(M4)
├── games/
│   ├── store/        (열정편의점) ← P1. 메타/분석/상태머신 모두 게임-로컬로 시작(D10)
│   └── watersort/    (AquaSlot)  ← P1↔P2 인터리브. 코어 import 강제(복붙 금지)
├── tests/                        # ★Vitest — 게임의 순수 상태머신 + 코어 로직(M1)
└── shared-assets/                # D:\캐쥬얼 게임 미러
```

### 3.1 GameModule 계약 (P2에 동결, 그 전엔 게임-로컬 씬 배열)
```ts
export const StoreGame: GameModule = {
  id: 'store', title: '열정편의점',
  assets: STORE_ASSETS, GameplayScene: StoreScene, config: STORE_CONFIG,
  hud: { coins, gems, timer, combo, lives },
  liveops: { shop, spin, daily },   // P2에서 코어 활성. P1엔 게임-로컬 구현.
  powerups: ['hammer'],
};
```

### 3.2 피싱 → 코어 수확 매핑 (재기준선 ~25%, C2)
| 피싱 원본 | 처리 | 비고 |
|---|---|---|
| `ui/scale.js`, `ui/popup.js`, `ui/components.js` | **수확** | 게임 무관. 진짜 재사용 핵심. |
| `systems/{Music,haptics,pwa}.js` | **수확** | 그대로(TS화). |
| `UserProfile.js` | **참고만, 재작성** | fishing 전용 필드(totalCatches)·gold=2000 하드코딩. SaveStore 신규. |
| `ShopScene.js` | **harvest 아님 — 신규** | 구매 버튼 `()=>{}` 빈 껍데기. LiveOps 상점 로직 0 → 신규 작성. |
| `BootScene.js` | **참고만, 재작성** | fishing 텍스처 키·LocationLoader 3단 하드코딩. |
| `config/game.config.js` LAYOUT | **이식 안 함** | ~40 매직 오프셋. grid 게임엔 부적합 → `gridLayout()` 신규(H4). |
| `entities/*`, `FishingScene` | 추출 안 함 | 피싱 전용. |

> 재사용 추정: **~25%**(유틸 레이어). 메타/세이브/부트/상점은 신규. "추출+일반화"는 UI/스케일/오디오에 한정.

---

## 4. P1 게임: 열정편의점

### 4.1 메카닉 (구현 전 `/plan-design-review` 권장)
5×3 진열대. 상품 탭→같은 종류 빈 칸 비행 배치. 칸 완성→점수+리필. 콤보·타이머·망치 파워업.

### 4.2 구조 (M1 핵심)
- **`storeMachine.ts`** — 씬-프리 순수 상태머신: tap→place→combo→리필→**데드상태 판정**. ← Vitest 80% 대상.
- `StoreScene.ts` — 상태머신을 Phaser로 렌더/입력 바인딩(얇게).
- 메타(상점/스핀/데일리/하트)·분석 — **게임-로컬**(P2에 코어 hoist).
- `gridLayout(cols,rows,box)` — grid 기하 계산(H4).

### 4.3 엣지케이스(테스트) — 애니 중 탭·더블탭·타이머-애니 충돌·**데드상태**·백그라운드 일시정지.

### 4.4 데이터 모델
```ts
STORE_CONFIG = { products[], levels[{ shelf, goalCount, timeSec, spawnTable }], rewards, shop[] }
```

### 4.5 디자인 에셋 (사용자 제공 — `shared-assets/Store/`, 30개 복사 완료)
원본 `D:\캐쥬얼 게임\Store` → `d:\Dev\CasualGame\shared-assets\Store\`. **전부 PNG → M3 파이프라인에서 WebP 변환**(원본은 디자인 소스 보존).
| 키 | 매핑 | 용도 |
|---|---|---|
| `CG_ST_BG_01~03` + ChatGPT 4종 | `games/store/assets/bg/` | 편의점 내부 배경 |
| `CG_ST_UI_01~06` | 코어 HUD 슬롯(스토어 스킨) | 레벨뱃지(UI_01=Lv)·코인·타이머·콤보·버튼 |
| `CG_ST_item_01~16` | `games/store/assets/products/` | 16 상품(item_01=복숭아소다) → spawnTable |
> 키 네이밍은 피싱 규약 계승(bg_/hud_/btn_/item_). assets.config가 키↔경로 매핑.

### 4.6 디자인 명세 (plan-design-review 확정 — [DESIGN.md](DESIGN.md) 토큰 준수)
- **메카닉(D2) = 그룹 정렬**: 진열대 상품을 탭→같은 상품 칸으로 이동. 칸을 동일 상품으로 채우면 그룹 완성→점수+비움+리필. 모든 목표 그룹화 시 클리어. 콤보=연속 정확 이동.
- **상태표(P2)**:
  | 상태 | 사용자가 보는 것 |
  |---|---|
  | 로딩 | 편의점 배경 페이드인+진행바(피싱 LoadingScene) |
  | 빈 칸 | 점선 outline+약한 글로우(어포던스), 그룹 비면 새 상품 슬라이드인 |
  | 콤보 | 콤보 바 채움+"Combo xN" 팝 |
  | **데드락(D3)** | "정리할 수 없어요! 셔플?" 토스트 + **셔플 파워업**(무료 1회/광고). 침묵 금지 |
  | 승 | 진열대 반짝+"정리 완료!"+결과(점수·코인·콤보 보너스)→보상 |
  | 패 | 타이머 만료→시계 red 점멸→"시간 초과"→재시도/홈 |
- **HUD**: 컨셉 레이아웃 토큰화(상단 레벨뱃지·타이머·점수 / 콤보 바 / 하단 파워업: 망치+셔플+잠금슬롯).
- **접근성(P6)**: 터치타겟 ≥44px · 대비 ≥4.5:1 · 색+아이콘 병행 · 세이프에어리어.
- **파워업**: `hammer`(막힌 상품 제거) + `shuffle`(데드락 해소). GameModule.powerups에 등록.

---

## 5. 로드맵 (D10 인터리브)

- **P0 — 토대** ✅ **완료(2026-06-02)**: npm workspaces + TS + Vite, Phaser 3.90.0 루트 단일. core 수확(scale/ui/layout/tokens/systems/game-shell). games/store 빈 데모 부팅. 검증: vitest 3/3 · vite build OK · tsc 0 에러.
- **P1 — 열정편의점 + AquaSlot 인터리브** _(진행 중, 2026-06-02)_:
  - 열정편의점 ✅ **플레이 가능**: `logic/storeMachine`(그룹 정렬 순수 상태머신, Vitest 22테스트 100%stmt/95%branch) + `logic/levels`(3레벨+상품 카탈로그) + `StoreScene`(진열대·HUD·콤보·타이머·승/패·**데드락 셔플** D3) + `analytics`(게임-로컬 이벤트, D4 시드). 브라우저 렌더 검증됨(편의점 배경+상품 스택+HUD).
  - ⏳ 남은 P1: 메타(상점·스핀·데일리·하트) 게임-로컬, **watersort 동시 착수**(복붙 금지·core import 강제).
- **P2 — 코어 수확·동결**: 2소비자가 실제 공유한 것(메타·분석·레이아웃·세이브)을 hoist. GameModule 계약 + 라우팅 동결. Vitest 80%(순수 상태머신). 에셋 파이프라인 툴링.
- **P3 — match3 + tileconnect** (코어 위, **파일럿 리텐션 신호 게이트**, M2).
- **P4 — bubble + slice + skewer**.

---

## 6. 리스크

- **R1 과추상화 → D10 인터리브로 구조적 해소** (2소비자 동시).
- **R2 fork → D10 복붙 금지·import 강제로 P2가 선택 아닌 필수.**
- **R3 클라/origin별 지갑(H5)**: 게임별 독립 배포 = localStorage origin 분리 → P0~P3는 **게임별 지갑**. "공유 경제"는 단일 origin 또는 백엔드 필요(TODOS).
- **R4 메카닉 불확실** → `/plan-design-review`.
- **R5 테스트 가치(M1)**: 순수 상태머신 추출 후에만 80%가 의미. 씬 코드는 게임별 eng 리뷰.
- **R6 TS 포트세(H1)**: 수확 파일마다 JS→TS 포트 비용. Phaser 내부엔 `@ts-expect-error` 실용 허용.

## 7. NOT in scope
중앙 허브(D9) · 앵커 레이아웃 전면(D7, gridLayout은 P1 포함) · 스캐폴딩 CLI(D6) · 백엔드/서버 세이브/IAP 검증 · 공유 경제(origin 분리, H5) · 레벨 에디터 · Phaser 씬 E2E. → [TODOS.md](TODOS.md)

## 8. What already exists (~25%)
`scale`·`popup`·`components`·`Music`·`haptics`·`pwa`. 세이브/부트/상점/메타/분석은 **신규**(C2).

## 9. Dream state delta
```
빈 폴더+피싱 유틸 → [이 계획] 2게임 인터리브로 검증된 코어+메타+계측 → 12개월: 분석 무장 7종, 신작=게임플레이만
```

## 10. 수락 확장 / 보류
- **수락**: LiveOps 메타(D3) · 분석+원격설정(D4) · TypeScript(D5).
- **보류(TODOS)**: 스캐폴딩 CLI(D6) · 앵커 레이아웃 전면(D7) · 서버 세이브/IAP(R3) · 구조화 로깅 · 중앙 허브 · 공유 경제(H5) · 레벨 에디터.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | done | SELECTIVE EXPANSION, 11 decisions, 3 expansions accepted, 4 deferred |
| Outside Voice | architect subagent | Independent challenge | 1 | done | 3 CRITICAL + 5 HIGH + 4 MED, all accepted (D10/D11), fork-risk de-risked |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | npm workspaces, GameModule TS 계약·Vite alias 확정, storeMachine 상태머신+테스트 다이어그램(10분기/80%), 0 critical gap |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score 5→9/10, 메카닉=그룹정렬·5상태·데드락=셔플 확정, DESIGN.md 토큰셋 생성, 목업 생략(사용자 아트 존재) |

- **UNRESOLVED:** 0
- **VERDICT:** CEO + ENG + DESIGN 모두 CLEARED — 구현 준비 완료. 산출물: PLAN.md · TODOS.md · DESIGN.md · shared-assets/Store. 다음: P0 구현(모노레포 토대→파일럿+watersort 인터리브).
