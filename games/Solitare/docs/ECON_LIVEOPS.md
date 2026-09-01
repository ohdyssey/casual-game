# 경제 라이브옵스 — 일일 분석 → 조정 루프 (2026-08-25)

유저 플레이 데이터를 **일일 단위**로 모아 분석하고, 코드 배포 없이 **economy.json 수치만**으로
전체 유저의 수익·비용을 조정하는 운영 구조. 데이터 어휘는 econ-lab 대시보드의 일별 원장과 동일하다.

## 1. 데이터 흐름

```
실유저 플레이 ──(게임 내 훅)──▶ logic/dailyMetrics.ts (일일 누적, 기기당 60일)
                                        │  콘솔 __dailyMetrics() / exportDailyMetrics()
                                        ▼  (추후: PlayPOP API 업로드 — 미연동)
                                일일 지표 집계(전 유저 평균)
                                        │  아래 결정표로 판정
                                        ▼
              public/econ/economy.json 노브 수정 → 정적 재배포 (코드 빌드 불필요)
```

- **수집 지점**: 입장료(홈/진입팝업/다음판) · 부스터 실지출 · 건설(코인+다이아) · 스타터팩 결제 ·
  핀치(코인 부족) · 판 정산(승/별/보상 분해 — 중단 판은 보상 회수와 일관되게 미집계)
- **계측 모드(?lab=1)는 기록 안 함** — 봇이 실유저 지표를 오염시키지 않는다
- 대시보드 실측(봇)과 실유저 지표가 **같은 필드명**이라 나란히 비교 가능

## 2. 일일 KPI → 조정 노브 결정표

| KPI (일일 지표에서 계산) | 건강 범위(초기 기준) | 벗어나면 조정할 노브 |
|---|---|---|
| **판당 순손익** = (starCoins+leagueCoins+eventCoins+tierCoins−fee−plus5)/games | -500 ~ +500 | `leagueCoinPerStar` (±10%씩 — 수입의 최대 축) |
| **핀치율** = pinch/starts | 5~15% (결제 압박 존재하되 이탈 안 나게) | 낮으면 무료 유입 축소(`leagueCoinPerStar`↓·티어 축소), 높으면 ↑ 또는 별보상 `starMult`↑ |
| **핀치 도달 레벨** = 첫 pinch 발생일의 levelMax | L10~L30 (익숙해진 뒤) | 이르면 건설비 곡선↓ 또는 startCoins↑(신규만), 늦으면 반대 |
| **결제 전환** = iapCount/핀치 발생 유저 | 관찰 지표 (오퍼 구성 검증) | 낮으면 스타터팩 구성/가격, 오퍼 문구 |
| **무부스터 승률** = cleanWins/wins | 30~55% | 난이도(`DYN_STOCK_REDUCE` 재보정 — 코드측) · ＋5 보조 `PLUS5_ASSIST_BY_BUY` |
| **리그 참여도** = leagueStars/games | 4~7 (별 유입 5.64/판 설계 기준) | 벗어나면 사다리 목표 `leagueGoalMult` 재보정 |
| **위클리 진행** = eventItems 로 칸 통과율 | 주기 내 3칸+ 통과 | `eventGoalMult`↓ (실측: collection 칸 공급 0.45/판 병목) |
| **다이아 수지** = boardDiamonds+티어 vs buildDiamonds | 순증 ≤ +30/일 | 티어박스 다이아(코드측) · 건설 다이아 곡선 |
| **평균★** = starsSum/wins | 2.0~3.0 | `starMult` 곡선 · ＋5 별 페널티 |

⚠️ 노브 하나를 바꾸면 **다른 KPI가 같이 움직인다** — 한 번에 한두 개만, ±10% 단위로.
⚠️ `leagueGoalMult`·미션 보상표를 바꾸면 파형 사다리 간격(dailyLeague.ts 주석)을 재검산할 것.

## 3. 조정 절차 (운영 루틴)

1. 지표 수집: 콘솔 `__dailyMetrics()` (또는 추후 서버 집계)
2. 결정표로 판정 → economy.json 의 노브 수정 (`leagueGoalMult`·`leagueCoinPerStar`·`leagueGrandMult`·`eventGoalMult`·`eventCoinMult`·`eventGrandMult`·`startCoins`·`feeBase` 등)
3. **배포 전 검증**: econ-lab 대시보드(이기면 다음 레벨 모드, 시작 20,000)로 1~2일치 시뮬 →
   판당 순손익·핀치 도달 레벨이 목표 범위인지 확인
4. 정적 재배포 (`npm run deploy...` — economy.json 만 갱신돼도 전 유저 적용)
5. 다음 날 지표로 효과 확인 — 되돌리려면 JSON 원복

## 4. 현재 기준값 (2026-08-25 신경제)

startCoins 20,000 · leagueCoinPerStar 320 (일수입 -30%) · 파형 사다리 [10,30,15,45,22,65,35,100,55,300]
· 순위 보상 = 평균 유저 계측 제외 · +5 보조 0/30/50% · 스타터팩 30,000+부스터+컬렉션 1장(초회)
· 실측: 첫 핀치 L11(건설 소프트월 직후) · 결제 1회 런웨이 ≈ 20판 · 2차 핀치 L30 부근(코인팩 필요 지점)
