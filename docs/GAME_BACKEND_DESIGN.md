# PlayPOP — 캐쥬얼 게임 백엔드 기능 설계 + "어디까지" 범위 제안

> **질문:** 게임서버의 기본기능을 어디까지 설계할까? 아이템상점·일일미션 등 캐쥬얼 백엔드를 같이 설계.
> **자매 문서:** 인프라/스케일/PvP = `~/.claude/plans/polished-singing-sunbeam.md` · 통합↔독립 양립 = `docs/PLATFORM_INTEGRATION_DESIGN.md`. 본 문서는 그 위의 **기능/데이터 레이어**.

---

## 0. "어디까지" — 한 줄 권고

> **데이터 모델과 API 계약은 Tier 0~2까지 *지금* 설계·동결**(나중에 다시 칠하지 않게), **구현은 Tier 0→1→2 순(리텐션·수익 ROI)**, Tier 3는 인터페이스 훅만.

이유: 캐쥬얼 백엔드는 **콘텐츠를 데이터로** 다루면 기능 추가가 *운영(데이터 입력)*이지 *재배포*가 아니다. 그래서 스키마/계약을 넓게 잡아두는 비용은 작고, 좁게 잡으면 매 기능마다 재설계·마이그레이션이 든다.

### 스코프 티어
| 티어 | 묶음 | 기능 | 권고 |
|---|---|---|---|
| **T0 기반(필수)** | "진짜 게임서버"의 최소 | 인증/식별, **서버 권위 지갑(ledger)**, 클라우드 세이브, 서버시간, 안티치트 게이트, **리모트 컨피그**, 분석 이벤트, **단일 보상 지급 파이프라인**, **메일박스** | **지금 설계+구현** |
| **T1 라이브 핵심(출시 필수)** | 캐쥬얼 데일리 루프 | 하트/에너지, **아이템 상점**, **인벤토리**, **일일 로그인 보상**, **일일 미션/퀘스트**, 리더보드 | **지금 설계+구현** |
| **T2 성장(리텐션·수익)** | 재방문·과금 | 시즌/배틀패스, 업적, **이벤트(기간한정 상점·미션)**, 한정 오퍼·스타터팩, 보상형 광고, **IAP 영수증검증**, 푸시 | **지금 데이터·계약 설계**, 구현은 출시 후 |
| **T3 소셜/고급(선택)** | 확장 | 친구/레퍼럴, 길드/팀, 선물, A/B 실험, 행동기반 부정탐지, 라이브옵스 운영 콘솔 | **훅만**, 후순위 |

**"MVP 게임서버" 정의** = T0 + T1. (세이브 동기화만으로는 게임서버가 아니다 — 지갑·상점·미션·메일·리모트컨피그가 있어야 캐쥬얼 라이브 서비스다.)

---

## 1. 관통 설계 원칙 (캐쥬얼 백엔드의 핵심 5)

1. **콘텐츠 = 데이터(리모트 컨피그), 코드 아님.** 상점 카탈로그·일일 캘린더·미션·이벤트·확률을 **서버 데이터**로 → **재배포 없이** 운영·실험·기간한정. (현재 코드 상수인 `SHOP_ITEMS`/`DAILY_REWARDS`/`SPIN`을 서버 config 로 승격.)
2. **단일 보상 지급 파이프라인.** 모든 보상(데일리·미션·상점·스핀·IAP·메일·이벤트)이 **하나의 멱등 서버 `grant()`** 로 흐름 → 지갑 ledger + 인벤토리 + (오프라인이면)메일박스. 기능별 지급 코드 금지.
3. **진행 이벤트 → 진척 팬아웃.** 게임이 `emit(progress)`(예: `level_clear`·`score`·`play`·`match_win`) 하나만 보내면 서버가 **미션·퀘스트·업적·배틀패스 XP**를 동시 갱신. 기능마다 별도 카운터 금지.
4. **서버 권위 + 멱등 + 서버시간.** 모든 claim/spend/submit 은 서버 검증·`idempotency_key`·서버시계(쿨다운/리셋 클라 시계 불신).
5. **메일박스 = 만능 전달.** 보상·보상금(점검 보상)·선물·운영지급을 메일로 → **오프라인 유저에게도** 지급, 클라는 수신·수령만.

```
[게임/서버 이벤트] ─┐                      ┌─> 미션/퀘스트 진행
                    ├─> [Progress Ingest] ─┼─> 업적 진행
[claim/buy/IAP/ad] ─┘                      └─> 배틀패스 XP
        │
        └─> [grant() 멱등] ─> wallet_ledger + inventory + mailbox(오프라인)
```

이 두 파이프(Progress Ingest, grant)가 캐쥬얼 백엔드의 척추다. 나머지는 그 위의 데이터·규칙.

---

## 2. 현재 자산 재사용 (`@casual/core/liveops`)

| 현재(클라 localStorage) | 백엔드 자원 | 변화 |
|---|---|---|
| Profile{coins,gems,lives,lastLifeAt,level,bestScore} | `profiles` + `wallet_ledger` | 잔액→ledger, 쿨다운→서버시간 |
| daily.ts(7일·20h) | `daily_calendar`(config) + `claim_log` | 캘린더 데이터화 |
| spin.ts(가중휠·8h) | `spin_table`(config) + `claim_log` | 확률 서버화(치팅방어) |
| shop.ts(고정 6품) | `shop_catalog`(config) + `purchases` | 카탈로그 데이터화·확장 |
| powerups{hint,shuffle,undo} | `inventory`(item stack) | 일반 인벤토리로 |
| Reward/Cost 타입 | 공용 `Reward`/`Cost` 원시 | grant/spend 파이프 입력 |

→ 모델·규칙(순수 함수)은 그대로 서버에서 재실행(상위 문서 §6 매핑). **클라 코드 최소 변경**.

---

## 3. 공용 원시 타입 (모든 기능이 공유)

```ts
type Reward = { coins?:number; gems?:number; energy?:number; items?:{id:string;qty:number}[]; xp?:number };
type Cost   = { coins?:number; gems?:number; items?:{id:string;qty:number}[] };
// grant 는 멱등: 같은 (userId, idempotencyKey) 재호출 = 1회 적용
grant(userId, tenant, reward, source, idempotencyKey): Wallet+Inventory delta
spend(userId, tenant, cost, reason, idempotencyKey): ok | 'insufficient'
```

---

## 4. 기능별 설계 (데이터모델 · API · 서버권위 · 양립)

> 모든 테이블에 `tenant`(platform|game:<id>) 격리 + RLS. 지갑 scope·테넌트는 [[PLATFORM_INTEGRATION_DESIGN]] 따름. 카탈로그/캘린더/미션/이벤트 = **버전드 리모트 컨피그**(서버 데이터).

### 4.1 화폐 · 지갑 (T0)
- **데이터:** `wallet_ledger`(append-only: user, tenant, currency, delta, source, game_id, idempotency_key, ts) + `wallet_balance`(파생 캐시).
- **API:** `GET /wallet`, 변경은 직접 X — 항상 `grant/spend` 경유.
- **서버권위:** 멱등·서버검증. 통화=coins(소프트)/gems(하드)/energy(하트). 확장 통화는 currency enum 추가만.

### 4.2 인벤토리 (T1)
- **데이터:** `inventory`(user, tenant, item_id, qty) + `item_defs`(config: id, type[consumable|booster|cosmetic|currency_pack|chest], stack, meta). powerups(hint/shuffle/undo)=consumable 항목.
- **API:** `GET /inventory`, 사용=`POST /inventory/consume {item_id, qty, context}`(서버 차감, 게임이 효과 적용).
- **서버권위:** 차감 멱등. cosmetic 은 소유 플래그.

### 4.3 아이템 상점 (T1) ⭐
- **데이터:** `shop_catalog`(config: shop_id, item_id, **price**{coins|gems|real}, grant:Reward, limits{perUser, perDay, stock}, schedule{start,end}, segment{타깃}, sort) + `purchases`(거래 로그·멱등).
- **상점 종류:** 상시(소비재·부스터·화폐팩) / **기간한정**(이벤트) / **한정오퍼·스타터팩**(1회·세그먼트) / 화폐 IAP 팩(→IAP).
- **API:** `GET /shop?placement=`(세그먼트·시간 필터된 카탈로그) · `POST /shop/purchase {sku, idempotencyKey}` → spend(or IAP검증) → grant.
- **서버권위:** **가격·재고·구매한도·확률 전부 서버.** 클라는 표시만. 한도=`purchases` 집계.
- **양립:** 공유모드 가격/오퍼는 platform 카탈로그, 독립모드는 game 카탈로그.

### 4.4 하트 / 에너지 (T1)
- **데이터:** profiles{energy, last_energy_at, energy_max} + `energy_config`(regen rate, max, refill cost). 현재 5개·10분.
- **API:** `POST /energy/consume`(플레이 시작) · `POST /energy/refill`(gems/광고). regen=서버시간 계산(클라는 표시 타이머).
- **서버권위:** `last_energy_at` 서버 소유(시계 조작 방지).

### 4.5 일일 로그인 보상 (T1)
- **데이터:** `daily_calendar`(config: day_index→Reward, cycle_len, streak_break_h) + profiles{daily_streak, last_daily_at} + `claim_log`.
- **API:** `GET /daily`(오늘 수령가능?·미리보기) · `POST /daily/claim {idempotencyKey}` → grant.
- **서버권위:** 20h 쿨다운·48h 스트릭리셋 서버시간. 멱등=하루 1회.

### 4.6 일일 미션 / 퀘스트 (T1) ⭐
- **데이터:** `mission_defs`(config: id, scope[daily|weekly|event], objective{type:`play|level_clear|score_ge|spend|win|collect`, target, params{game_id?}}, reward:Reward, sort) + `mission_progress`(user, mission_id, period_key, progress, claimed) + 일일 롤오버.
- **갱신:** **Progress Ingest** 가 게임 이벤트로 자동 증가(별도 카운터 X). 예: `level_clear`×3 → "오늘 3판 클리어" 진행.
- **API:** `GET /missions`(오늘분·진행률) · `POST /missions/claim {mission_id, idempotencyKey}` → 완료검증 후 grant. (선택)전체완료 보너스.
- **서버권위:** 진행 증가·완료 판정·수령 모두 서버. period_key=서버 날짜(UTC+KST 기준 택1).

### 4.7 업적 (T2)
- **데이터:** `achievement_defs`(config: id, tiers[{target,reward}], objective) + `achievement_progress`(user, ach_id, progress, claimed_tier).
- **갱신:** 동일 Progress Ingest(누적·영구). **API:** `GET /achievements` · `POST /achievements/claim`.

### 4.8 시즌 / 배틀패스 (T2)
- **데이터:** `season_defs`(config: id, start/end, track[free/premium]→레벨별 Reward, xp_curve) + `season_progress`(user, season_id, xp, level, claimed_levels[], premium_owned).
- **갱신:** Progress Ingest 가 XP 적립. 프리미엄=IAP. **API:** `GET /season` · `POST /season/claim {level, track}` · 구매=IAP.

### 4.9 메일박스 (T0) ⭐
- **데이터:** `mailbox`(id, user, tenant, subject, body, attachments:Reward, expires_at, read, claimed, source[ops|compensation|gift|event]).
- **API:** `GET /mail` · `POST /mail/claim {mail_id}`(→grant) · `POST /mail/claim-all`.
- **용도:** 운영지급·점검보상·선물·이벤트 보상의 **오프라인 전달 채널**. 모든 "밖에서 주는 보상"은 메일로.

### 4.10 이벤트 (기간한정 상점·미션) (T2)
- **데이터:** `event_defs`(config: id, window, content{shop_skus[], mission_ids[], banner, leaderboard?}). 기존 상점/미션/리더보드를 **기간·세그먼트로 묶은 메타**(새 시스템 아님).
- **API:** `GET /events/active`(배너·진입). 운영=config 입력만으로 이벤트 on/off(재배포 0).

### 4.11 리더보드 (T1)
- 상위 문서(Redis ZSET·게임별·기간별·안티치트 게이트) 참조. 점수 제출은 Progress Ingest 의 `score` 와 연동. (현재 가짜 NPC 보드 대체.)

### 4.12 리모트 컨피그 / 피처플래그 (T0) ⭐
- **데이터:** `remote_config`(tenant, key, value(json), segment, version). 상점·캘린더·미션·확률·밸런스·킬스위치.
- **API:** `GET /config?keys=`(ETag 캐시). 클라 부팅 시 1회 + 변경 푸시. **재배포 없이 운영**의 토대.

### 4.13 IAP 영수증 검증 (T2)
- **데이터:** `iap_products`(config: sku→Reward, store_id) + `receipts`(user, store, token, sku, status, verified_at, idempotency).
- **API:** `POST /iap/verify {store, receipt}` → 스토어 서버검증(Apple/Google) → grant(멱등=영수증). 환불 웹훅→회수.
- **서버권위:** **절대 클라 신뢰 X.** 통합=플랫폼 결제 계정, 독립=스토어별.

### 4.14 보상형 광고 (T2)
- **데이터:** `ad_placements`(config: id, reward, daily_cap, cooldown) + `ad_grants`(로그·캡).
- **API:** `POST /ads/reward {placement, ssv_token}` → **SSV(Server-Side Verification)** 검증 후 grant. 캡·쿨다운 서버.

### 4.15 푸시 / 알림 (T2)
- **데이터:** `devices`(user, push_token, platform) + 캠페인. 트리거=하트 충전완료·데일리리셋·이벤트·복귀. (네이티브 우선, 웹은 PWA push.)

### 4.16 친구 / 레퍼럴 (T3)
- **데이터:** `referrals`(inviter, invitee, reward, status) + (선택)`friends`. 초대보상=grant. 부정(셀프초대) 방지.

### 4.17 분석 이벤트 (T0)
- **데이터:** `events`(user, tenant, name, props, ts) → 웨어하우스(BigQuery 등). 표준 이벤트(session_start, level_*, purchase, ad_*, mission_*). Progress Ingest 와 공유 가능.

### 4.18 안티치트 (T0, 전 기능 관통)
- 서버 권위(지갑·미션·점수·상점), 멱등, 서버시간, 레이트리밋, 점수 타당성(시간·이동수 대비), 이상탐지(T3). 클라 보고는 **재검증 후에만** 반영.

---

## 5. PlatformContext 포트 매핑 (계약 확장)

[[PLATFORM_INTEGRATION_DESIGN]] 의 `PlatformContext` 를 본 기능들로 확장(여전히 어댑터로 통합/독립/로컬 주입):

```ts
interface PlatformContext {
  auth; wallet; save; board; track;          // 기존
  inventory: InventoryPort;                   // 4.2
  shop:      ShopPort;                        // 4.3 (catalog/purchase)
  energy:    EnergyPort;                      // 4.4
  daily:     DailyPort;                       // 4.5
  missions:  MissionPort;                     // 4.6 (list/claim) + progress.emit
  progress:  (e:ProgressEvent)=>void;         // 4.6~4.8 팬아웃 입력
  mail:      MailPort;                        // 4.9
  config:    ConfigPort;                      // 4.12
  iap?: IapPort; ads?: AdsPort;               // 4.13~4.14
  // season/achievement/events 는 config+progress 로 충당, 포트는 T2에 추가
}
```
**Local 폴백:** 백엔드 없이도 config=번들 기본값, grant/spend=localStorage → **현재 동작 보존**(독립·오프라인 데모).

---

## 6. 구현 순서 (상위 P0~P3 정렬)

| 단계 | 백엔드 기능 |
|---|---|
| **P0** | 인증·**지갑 ledger**·세이브·**리모트컨피그**·**grant/spend 파이프**·**메일박스**·분석·안티치트 게이트 |
| **P1** | 하트·**아이템상점**·인벤토리·**일일보상**·**일일미션(Progress Ingest)**·리더보드 → *MVP 게임서버 완성* |
| **P2** | 시즌/배틀패스·업적·이벤트·한정오퍼·**IAP검증**·보상형광고·푸시 |
| **P3** | 레퍼럴·길드·선물·A/B·정밀 안티치트·라이브옵스 콘솔 |

---

## 7. 결정 포인트 (확인 필요)

1. **리셋 기준시각:** 일일(데일리·미션) 리셋 = KST 00시 vs UTC vs 유저별 가입시각? (글로벌 대비면 UTC 또는 KST 고정 권장.)
2. **통화 체계:** coins(소프트)/gems(하드)/energy 외 **이벤트 토큰**(기간한정 통화) 도입 여부 — 도입 시 currency enum 확장.
3. **미션 갱신 위치:** Progress Ingest 를 **서버 권위**(점수/판수도 서버 재검증) vs 클라 보고+표본검증 — 치팅 민감도로 결정.
4. **운영 콘솔(T3) 시점:** 초기엔 SQL/마이그레이션으로 config 입력 → 언제 어드민 UI 도입?
5. **리모트컨피그 세그먼트:** 신규/리텐션/과금 세그먼트 타게팅 1차 범위.

---

## 8. PoC 게이트

1. **grant 파이프 멱등:** 같은 idempotencyKey 2회 → 1회 적용(지갑/인벤/메일).
2. **상점 서버권위:** 클라가 가격·재고 위조 시도 → 서버 거부, 한도 초과 차단.
3. **일일미션 팬아웃:** `level_clear` 이벤트 1개 → 미션+업적+배틀패스 동시 진행 + 완료 claim grant.
4. **리모트컨피그 라이브:** 상점 SKU/일일 캘린더를 **재배포 없이** config 변경으로 반영.
5. **메일 오프라인 지급:** 오프라인 유저에게 운영 보상 메일 → 다음 접속 수령.
