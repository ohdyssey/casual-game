# 솔리테어 하이츠 — 작업목록 (WORKLOG)

이 게임의 **진행 상황 단일 문서**. 설계 근거·함정은 `CLAUDE.md`(구현 규약)와 `docs/*`(설계서)에 있고,
여기에는 **무엇이 끝났고 무엇이 남았는지**만 적는다.

- 갱신: **2026-08-31**
- 루트 `TODOS.md` 는 플랫폼 전체(CEO 리뷰) 백로그다 — 이 게임의 작업은 여기서 본다.
- `README.md` 의 "다음 단계"는 프로젝트 **초기(엔진 골격) 시점** 문구라 현재 상태와 맞지 않는다.

---

## 1. 현재 상태 한눈에

| 영역 | 상태 |
|---|---|
| 코어 게임(TriPeaks ±1 순환) | ✅ 완성 |
| 레벨 | ✅ **3,000판**(321~500 원본 → 편집 복제, 재생 검증 성공 2,985 / 실패 0) |
| 홈 타워·부지 | ✅ 메인 10층 · 2번 라인 20층 · 호텔(3번 라인) 15층 · 공공건물 5층 |
| 보너스 라운드(클론다이크, PO 호칭 "프리셀") | ✅ 4모드(1장/3장 × 일반/타임어택) |
| 경제·리그·이벤트 | ✅ 가동(economy.json SSOT + 대시보드) |
| 컬렉션 | ✅ 조각 수집(카드당 10조각), 7세트 이식 |
| 텍스처 메모리 | ✅ ASTC 파이프라인 — 부팅 상주 **156MB → 64MB** |
| 배포 | ✅ ryanlogic.kr(비밀번호 게이트) |
| 토스(앱인토스) 출시 | 🔍 **기술 검토 완료 · 착수 전** (§4) |

---

## 2. 최근 작업 (2026-08-30 ~ 08-31)

### 2.1 미션 보상 확률 정상화 ✅

`PlayScene` 의 미션 예고가 설계표대로 나오지 않던 문제를 셋 잡았다.

| # | 문제 | 조치 |
|---|---|---|
| 1 | **뽑기가 넉넉하면 종류를 통째로 stars 로 치환** — 그 조건이 거의 항상 참이라 표의 절반(44.5%)이 출현 2.9% 로 증발 | 공급 억제를 **종류가 아니라 장수**로(`missionStockAmount`) |
| 2 | **되돌리기(리와인드)가 보상표에 없었다** — 그런데 `plus5` 의 예고 아이콘이 하필 리와인드 그림이라 화면엔 리와인드가 뜨고 실제로는 뽑기 ＋3장이 나왔다 | `undo` 를 정식 편입(weight 8) + 아이콘 정정(plus5 → `UI_06-1`, undo → `UI_07-1`) |
| 3 | 표의 `collection weight 6` 이 죽은 값(레벨별 함수가 덮어씀) | 표에 실값(=하한 14) 명시 |

실측(레벨 2, 실게임 2만 회 추첨): **7종 전부 설계표와 일치**, 예고 표시 불일치 0건.

추가로 저레벨에서 카드류(＋2카드+컬렉션)가 49.6% 로 절반을 차지하던 것을 **A안**으로 조정 —
`COLLECTION_WEIGHT_EARLY` 34 → **18**. 레벨2 카드류 43.8% · 별 31.5%. 레벨20 이후는 불변.
경제 영향 없음(승률·＋5 구매·뽑기 잔여 동일), 초반 컬렉션 수급만 판당 0.26 → 0.19장.

- 파일: `logic/economyRules.ts` · `scenes/PlayScene.ts` · `scripts/play-sim.mts`
- 회귀: `logic/economyRules.mission.test.ts`
- 진단 도구: `scripts/measure-mission-drops.mts`(모델) · `scripts/measure-mission-roll-live.mjs`(실게임)

### 2.2 보너스 라운드 — 손맛·수집 구조 전면 보강 ✅

PO 지적 "카드가 눌리는 느낌이 없어 딱딱하다 / 가게에 손님도 없고 별 수집 기능이 없다"에 대응.

| 항목 | 내용 |
|---|---|
| **카드 탭 피드백** | 누르면 0.93배로 눌리고 떼면 **1.06배로 부풀었다** 복귀. `cardView.pressIn/pressOut/pressCancel`. 스톡 더미에도 적용 |
| **보드 다이아** | 컬럼 **맨 아래 카드 뒤**에 숨고 하단으로 26px만 삐져나옴. 그 카드가 컬럼을 떠날 때 회수. 배치율은 모드별(§표) |
| **손님·주문** | 메인의 `orderQueue.ts`·`customers.ts` 를 그대로 이식 — 손님이 줄 서고 5개 주문 |
| **별 게이지** | 저작 HUD 5칸 = **이 판에서 받을 리그 별 등급** |
| **미션 보상 풀** | **순수 수집 아이템만**(다이아·컬렉션 카드) — ＋카드/와일드/되돌리기 등 진행 아이템 제외 |
| **리워드 원장** | 판에서 모은 것은 전부 보관만 하고 **승리 결과 화면에서 지급**. 지면 소멸 |
| **리그 별** | **최종 등급 = 완료(1) + 연속 5매칭 횟수, 상한 5**. 판 도중 적립 없음 |

**보드 다이아 배치율**(승리 보상표와 같은 난이도 사다리)

| | 일반 | 타임어택 |
|---|---|---|
| 1장 뽑기 | 3판당 1개 | 2판당 1개 |
| 3장 뽑기 | 2판당 1개 | 1판당 1개 |

실측: 배치율 0.355 / 0.490 / 0.495 / 1.000 · 100% 맨 아래 카드 · 100% 화면 안.
리그 별 실측: 5매칭 1회 → 2 · 4회 → 5 · 30매칭 → 5 · 10매칭 6회 → **5**(이전 100+).

- 새 모듈: `logic/roundRewards.ts`(원장, 순수) · `logic/bonusStars.ts`(별 등급, 순수) · `ui/gaugeGeom.ts`(게이지 좌표 SSOT)
- 파일: `scenes/PlayKlondikeScene.ts` · `scenes/cardView.ts` · `logic/bonusGame.ts` · `logic/economyRules.ts`
- 회귀: `roundRewards.test.ts` · `bonusStars.test.ts` · `bonusGame.test.ts` · `economyRules.mission.test.ts`
- 진단 도구: `scripts/measure-klondike-press.mjs` · `measure-klondike-diamond.mjs` · `measure-klondike-mission.mjs`

### 2.3 공공건물 실종 버그 ✅

**홈 → 프리셀 → 홈** 으로 돌아오면 공공건물 5층과 민원 창구 5개가 통째로 사라졌다.

`buildOfficeTower` 는 `officeFloors.length === 0` 일 때만 도는데, 그 **배열 비우기가 함수 안에만** 있었다.
씬을 다시 켜면 배열에 **이전 씬에서 파괴된 이미지 5개**가 남아 관문에 걸려 타워를 다시 세우지 않았다.
→ `create()` 에서 `officeFloors`/`officeRoof` 를 비운다(바로 옆 `civicDeskBoxes` 와 같은 이유).

실측: 왕복 후 살아있는 층 0 → **5**, 창구 0 → **5**.

- 파일: `scenes/HomeScene.ts` · 진단: `scripts/probe-civic.mjs`

---

## 3. 진행 중 / 확인 필요

| # | 항목 | 상태 |
|---|---|---|
| 1 | **민원 창구(공공건물 프리셀 진입)** — `logic/civicDesks.ts` + `HomeScene` + `PlayKlondikeScene.deskPerkRewards` | 🚧 다른 작업 줄기로 진행 중. 이번 작업과 충돌 없이 보존했다 |
| 2 | **리그 별 유입 경로 변경** — 보너스 라운드가 이제 `addLeaguePoints` 로 리그 점수를 적립한다 | ⚠️ 예전 설계는 "보너스는 레벨 체계 밖"이라 의도적으로 분리했었다. 리그 완주 속도에 영향 — PO 확인 필요 |
| 3 | **미션 보상 다이아 빈도** — 보너스 풀에서 별을 빼면서 다이아·컬렉션만 남았다(다이아 약 30%) | ⚠️ 판당 다이아가 늘 수 있다. 수치 조정 여지 |
| 4 | **메인 솔리테어에 원장 구조 적용** — PO "향후 솔리테어에도 이 기능을 적용" | 🔜 `roundRewards.ts` 를 재사용 가능하게 지어 둠. 미착수 |
| 5 | **2번 라인 11~20층 건설 진행** — 표시(`SHOW_ALL_FLOORS_TEST`)만 되고 건설 로직은 MAX_FLOORS(10) 기준 | 🔜 |
| 6 | **컬렉션 세트 팝업 보상 지급** — 코인 2000·상자 200 표기는 있으나 실지급 배선 없음 | 🔜 표시 전용 |
| 7 | **컬렉션 카드 수급 과잉** — 승리마다 2~3장이라 10세트 × 9장이 수 주 안에 다 모인다 | ⚠️ 세트 추가(아트) 없으면 중복만 쌓임 |

---

## 4. 토스(앱인토스) 출시 — 기술 검토 결과

2026-08-31 검토. **용량은 통과하지만 부팅 방식이 관문이다.**

### 요건 대비 현황

| 요건 | 우리 상태 |
|---|---|
| 번들 **압축 해제 기준 100MB** | 84MB — 통과(여유 16%). 단 `cardLevels.prev/prev2.json` **7.4MB 쓰레기** 포함 |
| **10초 이내 최초 화면** | ❌ 로컬호스트에서도 **10.8초**. 부팅에 **75.3MB / 580요청** |
| 백그라운드 사운드 즉시 종료 | ❌ `visibilitychange` 핸들러 없음 |
| 필수 SDK 5종(로그인·저장소·리더보드·Safe Area·행동기록) | ❌ 미적용 |
| eval 금지 / HTTPS·wss | ✅ (phaser 번들에 `new Function` 1건 — 확인 필요) |
| 최소 OS Android 7 / iOS 16 | ✅ 빌드 타깃 es2020 |

### 막는 것 (P0)

1. **부팅에 카탈로그를 통째로 올린다** — 매니페스트 397키 중 그룹 분리는 76키뿐, 321키가 부팅 일괄 로드
2. **배포본에 비밀번호 게이트** 스크립트가 박혀 있어 `.ait` 에 넣으면 첫 화면이 안 뜬다
3. **외부 CDN 폰트**(Google Fonts·jsDelivr 11요청) — 실패 시 캔버스 텍스트가 폴백으로 굳는다
4. 백그라운드 사운드 정지 없음
5. 필수 SDK 미적용

### 제안 순서

1. **토스 전용 빌드 타깃**(`vite --mode toss`) — 게이트 제거 · 개발용 html 제외 · 백업 json 제외 · 폰트 번들 내장 → 84MB → 76.6MB (0.5일)
2. **부팅 에셋 분해** — 그룹 커버리지 76키 → 300키+. 목표 부팅 34.8MB → 5MB 이하 (2~3일, **가장 중요**)
3. 체크리스트 대응 — `visibilitychange` 사운드 정지(코어에 넣어 전 게임 공통) · backGuard 분기 · 광고 없는 "광고 제거" 판매 UI 숨김 (1~2일)
4. SDK 연동 (3~5일)

문서상 "리소스는 외부 스토리지/CDN + Lazy Loading" 이 공식 권장이라, 용량과 부팅 시간의 해법이 같다.

- 진단 도구: `scripts/measure-boot.mjs`

---

## 5. 최근 검증 기준선

| 항목 | 값 |
|---|---|
| `npx tsc --noEmit` | 통과 |
| `npx vitest run games/Solitare` | **582건 통과** |
| 레벨 재생 검증 | 성공 2,985 · 실패 0 · 해답없음 15(1~500의 기존 결함) |
| 부팅 텍스처 상주(조립본, ASTC) | 64MB / 한도 160MB |
| 배포본 크기 | 84MB |

---

## 6. 회귀·진단 명령 모음

```bash
npm run test                     # 루트에서: npx vitest run games/Solitare
npm run qa:play                  # 플레이 봇 회귀(화면==상태 불변식)
npm run qa:bonus                 # 보너스 라운드 회귀
npm run qa:popups                # 팝업/그룹 로딩 회귀
npm run qa:league                # 리그 정산 회귀
npm run check:budget             # 텍스처 예산 게이트(넘으면 빌드 실패)
npm run gen:unused-assets        # 미사용 에셋 목록 재생성(저작 바꾼 뒤 diff 확인)
npm run measure:textures         # 표시 크기 계측 → gen:diet-hints

# 이번 작업에서 추가한 진단(임시가 아니라 회귀용으로 유지)
npx tsx scripts/measure-mission-drops.mts --from 1 --to 60 --tries 30
node scripts/measure-mission-roll-live.mjs --level 2 --n 20000   # dev 서버 필요
node scripts/measure-klondike-diamond.mjs 200
node scripts/measure-klondike-mission.mjs
node scripts/measure-klondike-press.mjs
node scripts/probe-civic.mjs
node scripts/measure-boot.mjs http://localhost:8791/             # 배포본 정적 서버 필요
```
