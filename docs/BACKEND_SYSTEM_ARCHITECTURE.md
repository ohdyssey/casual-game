# PlayPOP — 캐쥬얼 게임 백엔드 시스템 기본 구조 (설계)

> **목적:** 백엔드 *시스템의 구조* — 서비스/모듈/계층/요청흐름/레포구조/런타임 — 를 구체화.
> **자매 문서:** 인프라·스케일·PvP=`~/.claude/plans/polished-singing-sunbeam.md` · 통합↔독립 양립=`docs/PLATFORM_INTEGRATION_DESIGN.md` · 기능·데이터·범위=`docs/GAME_BACKEND_DESIGN.md`. 본 문서는 그 셋을 **"어떻게 짜는가"** 로 묶는다.

---

## 0. 설계 원칙 (구조 결정 3개)

1. **모듈러 모놀리스 먼저.** 캐쥬얼 규모 + 린팀 → 마이크로서비스 X. **하나의 Node/TS API 서비스** 안에 도메인 모듈을 명확히 분리(폴더 경계=서비스 경계). 부하·조직이 커지면 모듈을 그대로 떼어 분리.
2. **Node + TypeScript** — `packages/core`의 **순수 도메인 로직(wallet·daily·spin·shop·missions)을 클라/서버가 그대로 공유**(규칙 1벌). 서버 프레임워크=**Fastify**(경량·고속) + **Zod**(경계 검증).
3. **3계층/모듈 + 2개 백본 파이프.** 각 모듈 = route→service→repository. 모든 기능이 공유하는 **`grant`(보상 지급)** 와 **`progress`(진척 팬아웃)** 두 도메인 서비스가 척추(`GAME_BACKEND_DESIGN.md` §1).

---

## 1. 시스템 개요 (런타임 토폴로지)

```
                         ┌───────────── 저가 CDN (에셋, 별도) ─────────────┐
 클라(웹/PWA/네이티브)──┤                                                 │
   │  HTTPS /api/*       └──> GCS 정적 에셋(immutable)                      │
   ▼
 [ API Gateway/LB + Cloud Armor(WAF·rate·DDoS) ]
   │   Authorization: Bearer <JWT>,  X-Tenant: platform|game:<id>
   ▼
 ┌──────────────── API 서비스 (Cloud Run, 무상태, 오토스케일) ─────────────────┐
 │  [edge 미들웨어]  auth · tenant · idempotency · validate(zod) · ratelimit   │
 │        │                                                                    │
 │  [도메인 모듈]  auth wallet inventory shop energy daily missions            │
 │                achievement season mail config board iap ads referral        │
 │        │ 모든 모듈이 호출 →                                                  │
 │  [백본 서비스]  grant(멱등 보상)   progress(진척 팬아웃)   anticheat         │
 │        │ pooled SQL              │ Redis                                     │
 └────────┼────────────────────────┼────────────────────────────────────────┘
          ▼                        ▼
   [ PgBouncer ] ─> [ Cloud SQL Postgres(HA, 스키마=도메인별, tenant 격리·RLS) ]
                    [ Memorystore Redis: 캐시·리더보드ZSET·rate·idemp·쿨다운락 ]
          ▲                        ▲
 [ Workers/Jobs (Cloud Run Jobs + Cloud Scheduler) ]  ── 일일리셋·보드스냅샷·영수증재검증·메일만료
 [ Realtime PvP (Colyseus on GKE) ] ── 같은 JWT 검증, 결과를 /api 로 write-back  (중기)
 [ Pub/Sub ] ── 분석 이벤트·비핵심 팬아웃(비동기)
```

**런타임 구성요소 4종:**
| 구성 | 역할 | 런타임 |
|---|---|---|
| **api** | 동기 REST(인증·지갑·상점·미션…) | Cloud Run(무상태, scale 0→N) |
| **workers/jobs** | 스케줄·배치(일일리셋·스냅샷·재검증) | Cloud Run Jobs + Scheduler |
| **realtime**(중기) | PvP 룸 | GKE(Colyseus) |
| **data** | 영속·캐시 | Cloud SQL + Redis (+ Pub/Sub, BigQuery) |

---

## 2. 도메인 모듈 구조 (api 내부 경계)

각 모듈 = **route(HTTP·검증) → service(도메인 규칙, core 재사용) → repository(SQL)**. 모듈 간 호출은 service 레이어로만(순환 금지).

| 모듈 | 책임 | core 재사용 |
|---|---|---|
| `auth` | 익명/소셜 JWT 발급·검증·링크 | — |
| `wallet` | 잔액·ledger | `liveops/profile`(코인/젬 규칙) |
| `inventory` | 아이템 스택·소비 | `liveops`(powerups) |
| `shop` | 카탈로그(config)·구매 | `liveops/shop` |
| `energy` | 하트 재생·소비·리필 | `liveops/lives` |
| `daily` | 로그인 보상·스트릭 | `liveops/daily` |
| `missions` | 일일/주간 미션·진척·수령 | (신규 규칙) |
| `achievement`,`season` | 업적·배틀패스 | (신규, progress 소비) |
| `mail` | 메일박스·첨부 수령 | — |
| `board` | 리더보드(Redis ZSET) | `liveops`(trophyScore) |
| `config` | 리모트컨피그·피처플래그 | — |
| `iap`,`ads` | 영수증·SSV 검증 | — |
| **`grant`**(백본) | 멱등 보상 지급→ wallet+inventory+mail | Reward 원시 |
| **`progress`**(백본) | 이벤트→ missions/achievement/season 팬아웃 | — |
| **`anticheat`**(횡단) | 타당성·레이트·서명검증 | — |

> 신규 게임 기능 추가 = 보통 **config 데이터 입력** + (필요시)모듈 1개. 척추(grant/progress)는 불변.

---

## 3. 요청 수명주기 (쓰기 예: 상점 구매)

```
POST /api/shop/purchase {sku, idempotencyKey}
 1) auth        JWT 검증 → userId
 2) tenant      X-Tenant 해석 → platform | game:<id> (격리 컨텍스트)
 3) idempotency Redis SETNX idemp:{user}:{key} → 중복이면 캐시 결과 반환
 4) validate    zod 스키마(sku 형식 등)
 5) ratelimit   Redis 토큰버킷 rate:{user}:purchase
 6) service     shop.service: config에서 sku 로드 → 가격·재고·한도 서버검증
 7) tx          단일 트랜잭션: spend(cost) + grant(reward) + purchases insert
                (FOR UPDATE/version, ledger append, 멱등키 기록)
 8) cache       wallet_balance·inventory 캐시 무효화/갱신
 9) respond     표준 envelope {ok, data:{wallet, items}, error:null}
```
**원칙:** 클라가 보낸 가격·보상은 **무시**, 서버 config 가 진실. 변경은 항상 grant/spend 트랜잭션. 멱등키로 재시도 안전.

---

## 4. 두 백본 서비스 (척추)

**grant(userId, tenant, reward, source, idemKey):**
- 멱등(같은 idemKey=1회). 트랜잭션: `wallet_ledger` append + `inventory` upsert + (오프라인/대량이면)`mailbox` insert. 통화/아이템/xp 한 번에. **모든 보상의 유일한 출구.**

**progress(userId, tenant, event):** 예 `{type:'level_clear', game_id, value}`
- 활성 `mission_progress`·`achievement_progress`·`season_progress` 를 규칙대로 증가(완료 플래그만, 지급은 claim 시 grant). **모든 진척의 유일한 입구.**
- 입력원: 게임 결과 제출(`/scores/submit`)·구매·광고·로그인 → progress 한 곳으로.

→ 이 둘만 견고하면 신규 라이브옵스(이벤트·시즌·미션)는 **데이터로** 얹힌다.

---

## 5. 데이터 계층 구조

- **Postgres**: 도메인별 스키마(또는 접두) — `acct`(users/profiles), `econ`(wallet_ledger/balance/inventory/purchases), `live`(daily/missions/achievement/season/mail), `cfg`(remote_config/*_defs/catalog/calendar), `board`(snapshots), `pay`(receipts). **모든 유저테이블에 `tenant` + RLS**(`tenant`·`auth.uid` 일치만). append-heavy(ledger/events)는 월 파티션(성장 시).
- **Redis**: `prof:{u}`(핫 프로필 캐시) · `lb:{game}:{period}`(ZSET) · `idemp:{u}:{key}` · `rate:{u}:{op}` · `lock:cooldown:{u}:{op}` · `cfg:{tenant}:v`(컨피그 캐시).
- **Pub/Sub → BigQuery**: 분석 이벤트(비동기, 핵심경로 밖).
- **연결**: Cloud Run → **PgBouncer(txn)** → Postgres(필수). 캐시 우선 읽기.

---

## 6. 횡단 관심사 (공통 미들웨어/라이브러리 = `packages/server-core`)

auth(JWT/JWKS) · tenant 해석 · **idempotency** · **zod 검증** · **rate-limit** · 표준 **에러 envelope**(`{ok,data,error{code,msg}}`) · 서버시간 유틸 · RLS 컨텍스트 세팅 · 로깅/트레이싱(OpenTelemetry)·Sentry · secrets(Secret Manager). **모든 모듈이 동일 미들웨어 통과** → 일관성·보안 기본값.

---

## 7. 레포 구조 (기존 npm-workspaces 모노레포에 추가)

```
CasualGame/
├─ packages/
│  ├─ core/                 (기존) Phaser 게임 셸 + **순수 도메인 로직**(liveops/* 등) — 클라·서버 공유
│  ├─ server-core/          (신규) 백엔드 공통: db(kysely/prisma), 미들웨어, idempotency, tenant, auth
│  └─ contracts/            (신규) **API/이벤트 계약 + zod 스키마**(클라·서버·PlatformContext 공유, 동결)
├─ apps/
│  └─ api/                  (신규) Fastify 모듈러 모놀리스: modules/{auth,wallet,shop,...} + jobs/
├─ services/
│  └─ realtime/             (신규·중기) Colyseus PvP
├─ games/                   (기존) 게임들 — PlatformContext 어댑터로 api 소비
└─ infra/                   (신규) IaC(Terraform): Cloud Run/SQL/Redis/Scheduler
```
- **공유의 핵심**: `packages/core`의 순수 규칙 + `packages/contracts`의 zod 스키마를 **클라(PlatformContext)·api·realtime 이 동일 import** → 규칙·계약 단일 출처.

---

## 8. API 표면 (리소스 맵, REST)

```
auth     POST /auth/anon · POST /auth/link · POST /auth/refresh
profile  GET  /profile
wallet   GET  /wallet                       (변경=각 op)
energy   POST /energy/consume · /energy/refill
daily    GET  /daily · POST /daily/claim
missions GET  /missions · POST /missions/claim
shop     GET  /shop?placement= · POST /shop/purchase
inventory GET /inventory · POST /inventory/consume
mail     GET  /mail · POST /mail/claim · /mail/claim-all
board    GET  /board/{game}?period= · POST /scores/submit
season   GET  /season · POST /season/claim
config   GET  /config?keys=          (ETag)
iap      POST /iap/verify
ads      POST /ads/reward            (SSV)
```
표준: 버전 프리픽스 `/api/v1`, JWT + `X-Tenant`, 멱등키(쓰기), 에러 envelope.

---

## 9. 런타임·배포 구조

- **api**: Cloud Run(min 2~3, max 캡, 동시성 80), 컨테이너 1 vCPU. PgBouncer 경유. blue/green 배포.
- **jobs**: Cloud Scheduler → Cloud Run Jobs — 일일리셋(미션 롤오버·스트릭정리)·리더보드 스냅샷·영수증 재검증·메일 만료·집계. 멱등·재실행 안전.
- **realtime**(중기): GKE Colyseus, 같은 JWT, 결과 write-back.
- **데이터**: Cloud SQL(HA, +read replica P3), Memorystore Redis(HA), Pub/Sub→BigQuery.
- **IaC**: Terraform(`infra/`), 환경=dev/stage/prod. 시크릿=Secret Manager. CI/CD=빌드→마이그레이션→배포.
- **멀티테넌트·양립**: 같은 api 가 `tenant` 로 platform/game 분기(통합/독립). 독립 게임 별도 인스턴스가 필요하면 같은 `apps/api` 를 다른 환경으로 배포(코드 동일).

---

## 10. 단계별 (상위 P0~P3 정렬)

| 단계 | 시스템 산출 |
|---|---|
| **P0** | `packages/{server-core,contracts}` + `apps/api` 골격(Fastify·미들웨어·db) + `auth·wallet·save·config·mail` + **grant 파이프** + jobs 기반. Terraform 최소(Run/SQL/Redis). |
| **P1** | `energy·shop·inventory·daily·missions·board` + **progress 파이프** + 일일리셋/스냅샷 jobs → *MVP 게임서버*. 게임은 PlatformContext 원격 어댑터로 연결. |
| **P2** | `season·achievement·iap·ads` + 이벤트(config) + 푸시. read replica·캐시 튜닝. |
| **P3** | `realtime`(PvP) 분리 서비스 + 멀티리전 + referral/운영콘솔 + 모듈 추출(필요 시 마이크로서비스화). |

---

## 11. 결정 포인트

1. **DB 접근:** Kysely(타입세이프 쿼리빌더, 가벼움·권장) vs Prisma(생산성·마이그레이션) vs raw SQL(word_eng 패턴) — 택1.
2. **프레임워크:** Fastify(권장) vs NestJS(구조 강제·무거움) vs Hono(엣지 친화).
3. **모놀리스 분리 시점:** 어느 부하/조직에서 모듈을 서비스로 떼나(기본=안 뗌).
4. **이벤트 버스:** Pub/Sub 도입 시점(P1 분석부터 vs P2).
5. **IaC 범위:** Terraform 전면 vs 초기 수동+부분 코드화.

---

## 12. PoC 게이트

1. `apps/api` 스켈레톤 1엔드포인트(`GET /profile`)가 auth·tenant·zod·에러envelope·PgBouncer 통과(headless).
2. **grant 멱등** 동시성 테스트(같은 키 병렬 2회=1회 적용).
3. **progress 팬아웃**: `level_clear` 1건→ 미션+업적+시즌 동시 진행.
4. **tenant 격리**: platform vs game:<id> 데이터 RLS 분리 검증.
5. **jobs**: 일일리셋이 미션/스트릭을 멱등·재실행 안전하게 롤오버.
