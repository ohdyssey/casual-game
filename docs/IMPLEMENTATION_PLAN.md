# PlayPOP — 게임 백엔드 구현 계획 (MVP → 최종완성)

> **무엇:** 앞선 설계 4종을 묶어 *실제로 무엇을, 어떤 순서로* 만들지 정리한 실행 계획.
> **설계 출처:** 인프라=`~/.claude/plans/polished-singing-sunbeam.md` · 양립=`docs/PLATFORM_INTEGRATION_DESIGN.md` · 기능/데이터=`docs/GAME_BACKEND_DESIGN.md` · 시스템구조=`docs/BACKEND_SYSTEM_ARCHITECTURE.md`.
> **상태:** 계획 문서(아직 구현 전). 각 단계는 **완료 기준(검증 게이트)** 을 통과해야 다음으로.

---

## 0. 한눈에 보는 로드맵

| 단계 | 이름 | 한 줄 목표 | 캐쥬얼 티어 | 결과 |
|---|---|---|---|---|
| **P0** | 기반(Foundation) | 백엔드 골격 + 계약 깔기. **게임 동작은 그대로** | T0 일부 | 뼈대 |
| **P1** | **MVP 게임서버** | 통합로그인 + 공유지갑 + 상점 + 일일미션 + 우편함 + 진짜 랭킹 | T0 + T1 | **출시 가능한 통합 백엔드** |
| **P2** | 성장/수익화 | 시즌패스·업적·이벤트·결제(IAP)·광고·푸시 | T2 | 리텐션·매출 |
| **P3** | **최종완성** | 독립 퍼블리싱 + 실시간 PvP + 스케일아웃 + 소셜 + 운영콘솔 | T3 + standalone + PvP | 완성형 플랫폼 |

**병렬 워크스트림(단계와 별개로 계속):**
- **W-A 에셋 최적화/CDN**(비용 최대 레버, P1과 병행 시작)
- **W-B 클라 통합**(PlatformContext 어댑터 → 게임 점진 이행)
- **W-C 인프라/IaC**(Terraform, 단계별 확장)

---

## 0-1. 착수 전 선결정 (이거 정해야 P0 시작)
설계 문서들의 결정포인트 중 **P0를 막는 5개**:
1. **클라우드**: GCP 서울(권장) 확정?
2. **프레임워크/DB접근**: Fastify + Kysely(권장) 확정?
3. **prod 토폴로지**: 서브패스(현행) 유지?
4. **일일 리셋 기준시각**: KST 00시 vs UTC?
5. **`contracts` v1 동결 범위**: 어디까지 v1에 넣나(나머지는 v2 확장).
→ 미정이어도 권장값으로 P0 진행 가능. 단 5번(계약 범위)은 P1 전에 합의 필요.

---

## P0 — 기반 (Foundation)
**목표:** 백엔드 서버 골격과 "계약 + 어댑터" 레이어를 깔되, **현재 게임/허브 동작은 1도 안 바뀐다**(무회귀). 백엔드는 아직 게임에 안 붙음.

### 백엔드
- [ ] 모노레포에 신규 패키지: `packages/contracts`(API·이벤트 zod 스키마, v1), `packages/server-core`(db·미들웨어·idempotency·tenant·auth 유틸).
- [ ] `apps/api` 스켈레톤: **Fastify** + 미들웨어(auth·tenant·zod검증·rate-limit·에러 envelope) + `GET /api/v1/health`, `GET /api/v1/profile`.
- [ ] DB 연결(**Cloud SQL Postgres** + **PgBouncer**) + 첫 마이그레이션(`acct.users/profiles`) + RLS 기본.
- [ ] **`grant()` 백본**(멱등 보상 지급: wallet_ledger + inventory + mail) 1차 + `econ` 스키마.
- [ ] `config`(리모트 컨피그) 읽기 + `mail`(우편함) 최소.
- [ ] **익명 인증**: `POST /auth/anon`(디바이스키→JWT), JWT 검증 미들웨어.

### 클라이언트 (W-B 시작)
- [ ] `packages/core/src/platform/`: **`PlatformContext` v1 인터페이스** + `resolvePlatform()` + **Local 어댑터**(현 `liveops`/localStorage 그대로 래핑 → **동작 동일**).
- [ ] `game-shell.ts`가 부팅 시 `resolvePlatform()` 주입(현 단계는 항상 Local).
- [ ] 기존 `setProfileStore` 를 PlatformContext 안으로 흡수(하위호환 유지).

### 인프라 (W-C)
- [ ] `infra/` Terraform 최소: Cloud Run(api), Cloud SQL, Memorystore Redis, Secret Manager, dev 환경.
- [ ] CI: 빌드 → 마이그레이션 → 배포 파이프라인 1줄기.

### ✅ 완료 기준
- `GET /profile`가 auth·tenant·검증·PgBouncer 통과(headless/curl).
- **게임 16종·허브가 Local 어댑터로 기존과 100% 동일 동작**(타입체크·테스트·headless 무회귀).
- `grant()` 멱등 단위테스트(같은 키 2회=1회).

---

## P1 — MVP 게임서버 ⭐ (출시 목표)
**목표:** 허브를 통해 **통합 로그인 + 공유 재화 + 상점 + 일일미션 + 우편함 + 진짜 랭킹**이 라이브로 동작. = "진짜 게임 백엔드". (홈페이지 `PLAY_BLOCKED` 해제 후보 시점.)

### 백엔드 (도메인 모듈 — apps/api/modules)
- [ ] `wallet`(원장·잔액캐시) + `GET /wallet`
- [ ] `energy`(하트 재생·소비·리필, 서버시간)
- [ ] `inventory`(아이템 스택·소비) + `item_defs`(config)
- [ ] `shop`(카탈로그=config, 가격·재고·한도 **서버권위**) `GET /shop` `POST /shop/purchase`
- [ ] `daily`(출석 보상, 캘린더=config) `GET /daily` `POST /daily/claim`
- [ ] `missions`(일일미션) + **`progress()` 백본**(이벤트→미션 진행 팬아웃) `GET /missions` `POST /missions/claim`
- [ ] `board`(리더보드, **Redis ZSET**) `GET /board/{game}` `POST /scores/submit`(안티치트 게이트)
- [ ] **Workers/Jobs**: 일일 리셋(미션 롤오버·스트릭 정리)·리더보드 스냅샷 (Cloud Scheduler→Run Jobs, 멱등)
- [ ] 리모트 컨피그로 **상점/캘린더/미션 데이터** 운영(재배포 0)

### 클라이언트 (W-B 본격)
- [ ] **Integrated 어댑터**: 허브 SSO 토큰으로 api 호출(공유지갑 `platform` scope).
- [ ] 허브 SSO: `account.ts`가 익명세션 보유 + (같은 origin)공유 토큰 또는 포털 **`auth` 메시지**로 게임에 전달(`portal/protocol.ts` 확장).
- [ ] 게임 점진 이행: **store부터** `loadProfile()` 직접호출 → `ctx.wallet/save/missions`로 교체. 이어 Archery·ZombieArrow·Logistics(현재 liveops 직접 사용 게임).
- [ ] 허브 `leaderboard.ts`의 **가짜 NPC 보드 → 진짜 ZSET 랭킹**으로 교체.
- [ ] 게임 결과 → `progress()` 호출 배선(미션 자동 진행).

### 인프라 (W-C) / 비용 (W-A)
- [ ] prod 환경 Terraform(min-instances·오토스케일·캡), 모니터링/알람(DB 풀 포화·에러율).
- [ ] **W-A 시작**: 에셋 786MB 트리밍(중복 스프라이트 제거) + 저가 CDN(Cloudflare/Bunny) 분리 → 대역폭 비용 급감.

### ✅ 완료 기준
- 한 게임(store) 플레이 → **서버에 코인 적립**, 상점 구매 시 서버 차감, **새 기기에서 로그인 시 잔액 유지**.
- **일일미션 자동 진행**: "3판 클리어" 이벤트 → 미션 진행 → 수령 시 grant.
- 진짜 랭킹에 점수 반영(상위 100 + 내 순위).
- 우편함으로 운영 보상 지급 → 접속 시 수령.
- **부정행위 방어 확인**: 클라가 가격/잔액/점수 위조 시도 → 서버 거부.
- 동접 부하 PoC: 1,500 rps + 데일리리셋 스파이크에서 DB 풀 안정(PgBouncer).

---

## P2 — 성장 / 수익화
**목표:** 재방문·과금 기능 추가. (데이터·계약은 P0~P1에서 이미 넓게 잡아둠 → 대부분 "데이터+모듈 추가".)

### 백엔드
- [ ] `season`(배틀패스: 무료/프리미엄 트랙, XP=progress로 적립) `GET /season` `POST /season/claim`
- [ ] `achievement`(업적, progress 누적)
- [ ] **이벤트**(`event_defs` config: 기간한정 상점·미션·배너 — 새 시스템 아님, 기존 것 묶기)
- [ ] **IAP 영수증 검증**(`POST /iap/verify`, Apple/Google 서버검증, grant 멱등, 환불 웹훅)
- [ ] **보상형 광고**(`POST /ads/reward`, SSV 검증, 캡·쿨다운)
- [ ] **푸시 알림**(devices 등록, 하트충전·데일리리셋·복귀 트리거)
- [ ] 한정 오퍼·스타터팩(세그먼트 타게팅, config)

### 클라이언트
- [ ] 게임/허브에 시즌패스·업적·이벤트 UI + IAP·광고 SDK 연결(PlatformContext `iap`/`ads` 포트).
- [ ] 잔여 게임들 PlatformContext 이행 완료(전 16종).

### 인프라
- [ ] read replica·캐시 튜닝, Pub/Sub→BigQuery 분석 파이프, 결제 환불 웹훅.

### ✅ 완료 기준
- 실제 결제(IAP) → 서버 영수증 검증 → 재화 지급(멱등). 환불 시 회수.
- 광고 시청 → SSV 검증 후 보상(캡 작동).
- 시즌패스 XP가 게임 플레이로 자동 적립, 보상 수령.
- 이벤트를 **재배포 없이** config로 켜고 끔.

---

## P3 — 최종완성 (Full Platform)
**목표:** ① 독립 퍼블리싱 ② 실시간 PvP ③ 동접 14만 스케일 ④ 소셜 ⑤ 운영콘솔.

### ① 독립 퍼블리싱 (양립 완성)
- [ ] **Standalone 어댑터**: 게임 자체 익명/소셜 로그인 + `game` scope 지갑.
- [ ] **멀티테넌트** 백엔드 마감: tenant=`game:<id>` 격리(RLS), 같은 api로 분기.
- [ ] **독립 패키지 빌드**: 같은 dist + `.env`(모드·백엔드·테넌트) + 스토어 메타.
- [ ] **Capacitor 네이티브 래핑** + 영구 캐시(매니페스트+`AssetCache`, 재다운로드 0 — 인프라문서 §9-B).
- [ ] 계정 링크/편입 머지(독립↔통합 지갑 합산 정책).

### ② 실시간 PvP
- [ ] `services/realtime`(**Colyseus on GKE**): 서버 권위 턴 릴레이 + 헤드리스 matter-js(사커플릭 `logic/` 재사용).
- [ ] Redis 매치메이킹 + **봇 폴백**(`chooseAiShot`), 재접속/이탈 처리.
- [ ] 결과 서명 → api로 write-back(경제·랭킹·안티치트).
- [ ] `GameModule.pvp?` 옵트인 + `packages/core/src/net/`(현 16종 무영향).

### ③ 스케일아웃
- [ ] PgBouncer 튜닝·read replica·Redis HA·테이블 파티셔닝·**멀티리전 읽기복제 + 글로벌 CDN**(쓰기 프라이머리 서울 고정).

### ④ 소셜 / ⑤ 운영
- [ ] 친구/레퍼럴(초대 보상, 부정방지), (선택)길드/팀, 선물.
- [ ] **라이브옵스 운영 콘솔**(admin UI: 상점·미션·이벤트·메일·세그먼트·킬스위치·환불).
- [ ] A/B 실험, 행동기반 부정탐지.

### ✅ 완료 기준
- **같은 게임 빌드**가 허브 통합으로도, 독립 앱(자체 로그인·격리지갑)으로도 출시·동작.
- 1v1 실시간 PvP 매치(봇 폴백 포함) 동작, 결과가 경제·랭킹에 반영.
- 동접 1만/게임 부하에서 SLA 유지(지연·에러율).
- 운영자가 콘솔에서 이벤트/보상/메일을 코드 없이 운영.

---

## 의존 관계 (무엇이 무엇을 막나)
```
P0(계약+grant+auth) ─ 필수선행 ─> P1 전체
P1.progress ──> P2(season/achievement)
P1.wallet/grant ──> P2(IAP/ads = grant 재사용)
P0.PlatformContext ──> P3 독립 어댑터
P1.api(auth/economy) ──> P3 PvP write-back
W-A(에셋/CDN)·W-C(IaC)는 P1부터 상시 병행
```

## 단계별 산출물 요약
| 단계 | 신규 코드 | 인프라 |
|---|---|---|
| P0 | `packages/{contracts,server-core}`, `apps/api` 골격, `platform/` 계약+Local어댑터 | Run/SQL/Redis(dev), CI |
| P1 | api 모듈 8종 + jobs, Integrated 어댑터, 게임 4종 이행, 진짜 랭킹 | prod 환경, CDN/트리밍, 모니터링 |
| P2 | season/achievement/iap/ads/push 모듈, 이벤트 config | read replica, 분석 파이프 |
| P3 | Standalone 어댑터, `services/realtime`, net 모듈, admin 콘솔 | 멀티리전, GKE, HA |

---

## 지금 당장 할 수 있는 첫 스텝 (P0 진입)
1. 선결정 5개 합의(권장값으로 즉시 가능).
2. `packages/contracts`에 **`PlatformContext` v1 + 기본 zod 스키마** 작성(코드 변경 없는 순수 타입).
3. `packages/core/src/platform/`에 **Local 어댑터**(현 liveops 래핑) → 게임 무회귀 확인.
4. `apps/api` Fastify 스켈레톤 + `GET /profile` + `grant()` 멱등 단위테스트.
→ 여기까지가 **위험 0의 P0 PoC**(게임 동작 안 바뀜). 통과하면 P1 통합 배선 시작.
