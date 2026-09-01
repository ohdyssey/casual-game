# 솔리테어 하이츠 — 레이드 메타 백엔드 · 인프라 스택 설계 (구체 서비스 선정)

> **게임 구조(확정 방향):** 솔리테어 플레이 → 재화 획득 → **층 건설** → **외부 유저 층 레이드 어택** →
> 성과를 **시즌 랭킹 보상**. (코인마스터형 비동기 소셜 메타)
> **자매 문서:** 보안 계층=`docs/EXTERNAL_ATTACK_DEFENSE_DESIGN.md` · 통제 상세=`docs/SECURITY_RELIABILITY_DESIGN.md` ·
> 기존 구조=`docs/BACKEND_SYSTEM_ARCHITECTURE.md`. 기존 방향(GCP 서울·클라우드 네이티브 자체구축)을 유지하며
> **실제 벤더/서비스 단위**까지 확정 제안한다. *(백엔드 빌드는 보류 중 — 본 문서는 착수 시의 설계 확정본.)*
>
> ⚠️ **부분 재검토(2026-08-31)**: 여기서는 Cloudflare 를 CDN/WAF 로만 쓰지만, **투데이 리그 티어 매칭**처럼
> 상태가 가볍고 트랜잭션 정합성 요구가 낮은 기능은 Cloudflare Workers+D1+Durable Objects 만으로 GCP 없이도
> 충분하다는 결론을 별도로 냈다 — `docs/CLOUDFLARE_SERVER_STRATEGY.md` 참조. 레이드 메타(이 문서의 본 주제)
> 처럼 무거운 트랜잭션형 기능은 이 문서의 GCP 안이 여전히 유효하다 — **기능별로 스택을 나눠 갈 수 있다.**

> ### ⚠️ 예외 트랙 — 틱택토 네온 실시간 대전 (2026-08-11)
>
> 위 방향(GCP 자체구축·Supabase 비채택·실시간 PvP 는 P3)에 대한 **의도적 예외**가 하나 있다.
> `games/TICTACTOE` 의 실유저 1v1 대전은 MS 스토어/토스 런칭 일정 때문에 **Vercel + Supabase**
> 매니지드 스택으로 먼저 붙였다(사용자 지시, 런칭 속도 우선).
>
> - 코드: `services/ttt-api`(Vercel 서버리스) · `packages/ttt-rules`(클라·서버 공유 규칙) · `games/TICTACTOE/src/net`
> - 셋업·엔드포인트: `services/ttt-api/README.md`
> - 이 트랙은 **플랫폼 원장(`apps/api`)과 완전히 분리**되어 있다 — 지갑·보상·진척에 손대지 않고,
>   틱택토 대전 상태와 대전 전용 레이팅만 갖는다. 본 문서의 레이드 메타 설계와 충돌하지 않는다.
> - 본 문서의 결론("비동기 PvP 면 실시간 서버 불필요")은 여전히 유효하다. 틱택토는 20초 턴제
>   **동기** 대전이라 요구가 다르고, 그래서도 상시 WebSocket 서버 없이 Supabase Realtime 로 해결했다.

---

## 1. 게임 구조 → 시스템 요구 번역 (설계의 출발점)

| 게임 기능 | 시스템 요구 | 핵심 성질 |
|---|---|---|
| 솔리테어 플레이 → 재화 | 세션 티켓 + **서버 리플레이 검증** + 원장 기록 | 결정적·순수 로직(이미 보유) |
| 층 건설 (타워) | 유저별 타워 상태 저장 (층·미수령 코인 `floorBanks`) | 문서형 상태 + 트랜잭션 |
| **레이드 어택** | **비동기 PvP**: 타겟 매칭 → 스냅샷 → 약탈 정산 → 알림 | ⭐ 실시간 연결 불필요(핵심!) |
| 랭킹 보상 | 시즌·리그 리더보드 + 주간 정산 | 고빈도 read, ZSET |
| 알림 (레이드 당함·복수) | 푸시 | FCM |

**가장 중요한 구조적 결론: 레이드는 "비동기"다.** 공격자는 수비자의 타워 **스냅샷**을 상대로 플레이하고,
결과는 서버가 원자적으로 정산한다. 웹소켓·실시간 서버(GKE·Colyseus)가 **필요 없다** — 전부
request/response HTTP 로 처리 가능. 이것이 인프라 비용과 복잡도를 한 단계 낮춘다.

---

## 2. 스택 확정안 (실제 서비스)

```
 유저 브라우저/앱
   │
   ├─ 정적(게임 빌드·에셋 88MB→다이어트) ──▶ ① Cloudflare  (CDN·WAF·DDoS·R2)
   │                                          └ egress 무료 = 에셋 대역폭 비용 0
   └─ API(JSON) ──▶ ① Cloudflare(프록시·WAF) ──▶ ② Cloud Run  (서울 asia-northeast3)
                                                    │  Fastify(기존 apps/api 그대로)
                       ┌────────────────────────────┼──────────────────┐
                       ▼                            ▼                  ▼
              ③ Cloud SQL PostgreSQL       ④ Memorystore Redis   ⑤ Cloud Tasks/PubSub
                (HA + PgBouncer)             랭킹 ZSET·rate-limit    시즌정산·알림 큐
                원장·타워·레이드 로그          레이드 타겟 풀           │
                       │                                              ▼
              ⑦ BigQuery (이벤트 싱크·이상탐지)              ⑥ Firebase Auth + FCM
                                                              익명인증 · 레이드 푸시
```

| # | 역할 | **선정** | 근거 | 검토한 대안 |
|---|---|---|---|---|
| ① | CDN·엣지 방어 | **Cloudflare** (Pages 또는 R2+CDN, WAF/DDoS 포함) | **egress 무료** — 우리 비용 구조에서 에셋 대역폭이 지배 항목(기존 분석). WAF·봇차단·rate-limit 이 무료/저가 티어에 포함 → 보안설계 L1 을 한 서비스로 | Cloud CDN(egress 비쌈), Vercel(현재 임시 — egress 한도·비용) |
| ② | API 서버 | **GCP Cloud Run** (서울) | 컨테이너 서버리스: 오토스케일·스케일제로·복제 무상태. 기존 Fastify 코드(apps/api) 그대로 컨테이너화. 운영 인력 최소 | GKE(운영비↑ — 실시간 PvP 생기면 그때), Cloudflare Workers(Postgres 커넥션·런타임 제약, 게임 원장엔 부적합) |
| ③ | 주 DB | **Cloud SQL for PostgreSQL** (HA) + PgBouncer | 돈(원장)은 ACID·행잠금·유니크 제약(멱등키)·FK 가 생명. 타워 상태는 **JSONB** 로 문서 유연성 흡수. 기존 설계(kysely+pg)와 일치 | **MongoDB Atlas — 비추천**(아래 §2.1), AlloyDB(초기 과함), Spanner(10k CCU 에 불필요) |
| ④ | 캐시·랭킹 | **Memorystore Redis** | 리더보드=ZSET(정석), rate-limit 토큰버킷, 레이드 타겟 풀 캐시 | Upstash(초기 비용↓ 대안으로 유효 — M1 은 Upstash 시작도 가능) |
| ⑤ | 비동기 잡 | **Cloud Tasks**(지연·재시도) + **Pub/Sub**(팬아웃) | 시즌 정산·푸시 발송·이상탐지 이벤트를 API 경로에서 분리 | 자체 큐(운영 부담) |
| ⑥ | 인증·푸시 | **Firebase Auth**(익명→소셜 링크) + **FCM** | 무료 티어 관대. 익명 우선 전략과 일치. 레이드 알림 = FCM 필수 | 자체 JWT 만(가능하나 소셜링크·복구를 재발명) |
| ⑦ | 분석·이상탐지 | **BigQuery** + Looker Studio | 경제 이벤트 싱크 → 발행/소각·환전 이상 대시보드(보안 L5). 종량제로 초기 ~0원 | 자체 ELK(운영비↑) |
|  | 관측 | Cloud Monitoring + **Sentry** | 골든시그널 + 클라/서버 에러 추적(기존 계획 B단계와 일치) | |
|  | IaC·배포 | Terraform + GitHub Actions → Cloud Run | 재현 가능한 인프라, canary/롤백 | |

### 2.1 왜 MongoDB 가 아닌가 (질문에 대한 직접 답)

- **원장(돈)이 시스템의 심장**인데, 이중지급 방지=유니크 멱등키 제약, 잔액 경합=행잠금(`FOR UPDATE`),
  레이드 정산=다중 행 단일 트랜잭션 — 전부 **관계형 DB 의 홈그라운드**입니다. Mongo 도 멀티도큐먼트
  트랜잭션이 되지만, 제약·잠금·감사 규율은 Postgres 가 더 단단하고 사고 시 복구 도구도 성숙합니다.
- Mongo 의 장점(스키마 유연한 문서 저장)은 **Postgres JSONB** 가 흡수합니다 — 타워 상태
  `{floors:[{level, bank, builtAt}...]}` 를 JSONB 컬럼 하나로 저장하면서, 지갑·원장은 정규 테이블로.
- 규모 면에서도 10k CCU(≈수백 write/s)는 Postgres 단일 프라이머리+리플리카로 충분 — 샤딩이 필요한
  규모(수십만 CCU)가 오면 그때 재검토해도 늦지 않습니다.

### 2.2 왜 Cloudflare 를 GCP 앞에 두는가

- 게임 특성상 **트래픽의 95%+ 가 정적 에셋**(첫 로딩 수십 MB × DAU). GCP egress 는 GB당 과금이라
  DAU 10만이면 CDN 비용이 API 서버비를 압도. Cloudflare 는 egress 무료 → **비용 구조가 근본적으로 다름**.
- 보너스: WAF·DDoS·봇 차단·엣지 rate-limit 이 따라옴 = 보안설계 L1 을 별도 구축 없이 확보.
- API 도 Cloudflare 프록시를 거치게 해(오렌지클라우드) 원본 IP 은닉 + L7 방어를 동적 경로에도 적용.

---

## 3. 레이드 시스템 상세 설계 (이 게임의 신규 코어)

### 3.1 데이터 모델 (Postgres)

```sql
towers      (user_id PK, floors JSONB, tower_value INT, updated_at)   -- floors=[{lv,bank,...}]
wallets     (user_id PK, coins BIGINT, diamonds BIGINT, ver INT)      -- 잔액(원장의 캐시)
ledger      (id, user_id, delta, currency, reason, idem_key UNIQUE, created_at)  -- append-only
raids       (id, attacker_id, defender_id, session_id UNIQUE, loot BIGINT,
             floors_hit JSONB, status, created_at)                    -- 레이드 이벤트 로그
shields     (user_id PK, until TIMESTAMPTZ)                           -- 보호막
revenges    (defender_id, attacker_id, expires_at)                    -- 복수권
seasons     (id, starts, ends, settled BOOL)
```

### 3.2 레이드 플로우 (비동기 PvP)

```
① 타겟 요청   POST /raid/target
   서버가 선정(유저가 고를 수 없음 — 부스팅 차단):
   - 후보 풀: 같은 리그/타워가치 밴드(Redis 캐시, 주기 갱신)
   - 제외: 실드 활성 · 최근 N시간 피격(쿨다운) · 자기 자신 ·
           **같은 디바이스/IP 그래프 클러스터(자전거래 차단)**
   - 반환: 수비자 타워 스냅샷 + raid_session 티켓(서명·TTL)
② 클라 플레이  스냅샷 상대로 어택 연출(층 선택·해머 등) — 클라는 표현만
③ 결과 제출   POST /raid/result {session_id, picks[]}
④ 서버 정산   단일 트랜잭션:
   SELECT wallets, towers FOR UPDATE (양쪽)
   loot = min( 규칙상 약탈액, 수비자 floorBanks 현재 잔액, 리그별 상한 )
   수비자 bank 차감 → 공격자 지갑 가산(ledger 2건, idem_key=session_id)
   raids 기록 → revenges 발급 → Cloud Tasks 로 FCM 알림 enqueue
```

- **동시성:** 수비자가 플레이 중이어도 안전 — 약탈액은 **커밋 시점 잔액**에 행잠금으로 캡.
  스냅샷과 달라졌으면 "가능한 만큼만" 가져간다(코인마스터 동일 규칙). 재제출은 `session_id UNIQUE` 멱등.
- **복수(revenge):** 특정 상대를 지정할 수 있는 **유일한** 경로 = 피격 기록 기반 복수권. 그 외 타겟팅
  불가 → 계정 간 코인 펌핑(부스팅) 구조적 차단.
- **오프라인 보호 UX:** 실드 아이템(재화 소모), 첫 피격 무료 실드, 미수령 bank 만 약탈 가능
  (수령해 지갑에 넣으면 안전) — 방어 행동에 게임적 동기 부여.
- **치팅 결합:** 레이드 결과도 L3 검증 대상(티켓 없는 제출 거부, picks 타당성 검증). 어뷰즈 스코어
  높은 계정은 타겟 풀에서 제외(선량한 유저 보호).

### 3.3 랭킹·시즌 (Redis + 정산 잡)

- 점수 이벤트(검증 통과분만) → `ZINCRBY lb:{season}:{league}` (write-through, Postgres 에도 이벤트 기록).
- 조회 = `ZREVRANGE` + 주변 순위(`ZRANK`) — 10k CCU 읽기 부하는 Redis 가 소화, API 는 30s 캐시.
- **주간 정산(Cloud Tasks 크론):** ZSET 스냅샷 → 등수별 보상을 `idem_key=season:{id}:user:{uid}` 로
  grant — 잡이 중복 실행돼도 1회 지급(멱등). 정산 후 리그 승강.
- 동점자: 먼저 도달한 쪽 우선(score 에 도달시각 보조 정렬 인코딩).

---

## 4. 용량 산정과 비용 (10k CCU / DAU ~10만 기준)

| 항목 | 추정 | 근거 |
|---|---|---|
| API rps | 피크 ~1–3k rps | 캐주얼: 유저당 요청 적음(세션 시작/종료·레이드·랭킹 조회). Cloud Run 10–30 인스턴스 |
| DB 쓰기 | 피크 수백 wps | 세션 결과+레이드 정산 중심 → `db-custom-2~4` + 리플리카 1로 충분. **샤딩 불필요** |
| 에셋 egress | 다이어트 후 ~20MB×신규DAU | Cloudflare 무료 → **$0** (이게 GCP CDN 이면 월 수백$) |

**월 비용 추정(러프):** 초기(수천 DAU) **~$250/월** → 10k CCU 급 **~$800–1,200/월**
(Cloudflare $0–20 · Cloud Run $100–300 · Cloud SQL HA $200–500 · Redis $50–150 · FCM/Auth ~$0 ·
BigQuery/로깅 $20–80). 실시간 서버가 없어서 이 수준 — 레이드가 비동기라는 설계 결정의 직접 효과.

---

## 5. 도입 로드맵 (기존 보류 상태와 정합)

| 단계 | 내용 | 게이트 |
|---|---|---|
| **M0 (지금·클라만)** | 보안문서 Phase A seam: 시드 주입·move log·경제 단일 경유 + **타워 상태 직렬화 포맷 확정**(towers.floors JSONB 와 동일 스키마로 로컬 저장) | 비용 0, 서비스 무변화 |
| **M1 서버 최소** | Cloudflare(정적+WAF) + Cloud Run + Cloud SQL + Firebase Auth. 원장·세션 검증(솔리테어 단독) | 게임 리텐션 검증 후(기존 재개 트리거) |
| **M2 레이드 메타** | towers 서버 이전 → 레이드 API·실드·복수·FCM | M1 안정 + 레이드 콘텐츠 완성 |
| **M3 시즌 랭킹** | Redis 리더보드 + 주간 정산 + BigQuery 이상탐지 대시보드 | — |
| **M4 규모/현금화** | 리플레이 표본검증 전환·그래프 탐지 고도화 · (환전 오픈 시) 보안문서 Phase C 전체 | ⛔ 환전은 L4 완비 전 오픈 금지 |

## 6. 요약 — 한 줄 결정들

1. **레이드=비동기 PvP → 실시간 서버 불필요** (HTTP 정산으로 충분, 비용·복잡도 급감)
2. **CDN=Cloudflare**(egress 무료+WAF), **API=Cloud Run 서울**, **DB=PostgreSQL**(원장 ACID, 타워는 JSONB)
3. **MongoDB 는 채택하지 않음** — 돈·제약·잠금은 관계형이 정석, 문서 유연성은 JSONB 로 충분
4. **랭킹=Redis ZSET + 멱등 정산 잡**, **알림=FCM**, **이상탐지=BigQuery**
5. 10k CCU 까지 샤딩·GKE·마이크로서비스 없이 위 구성으로 커버, 월 ~$1k 수준
