# 솔리테어 하이츠 — 서버 연결 구조 설계

> 2026-08-31 설계 → **2026-09-01 P0+P1+P2+P3 + 구글 계정 연동 구현·배포 완료**
>
> 상위 문서(플랫폼 공통, 이미 존재): `docs/BACKEND_SYSTEM_ARCHITECTURE.md` · `docs/GAME_BACKEND_DESIGN.md` ·
> `docs/RAID_META_INFRA_STACK_DESIGN.md` · **가장 가까운 선례** = `games/BobbleRunner/docs/SERVER_INTEGRATION.md`
> (같은 `apps/api` 를 붙이는 첫 게임 — 이 문서는 그 결정을 **따르고**, 솔리테어 고유 부분만 다룬다).
>
> ⚠️ **이 문서는 이전에 같은 세션에서 제안했던 `docs/CLOUDFLARE_BACKEND_ARCHITECTURE.md`(Workers+D1+Durable
> Objects) 안을 솔리테어에는 채택하지 않는다는 정정을 포함한다** — 이유는 §0-1.
>
> ✅ **P0(인프라)**: Cloud Run(`playpop-api`, asia-northeast3) + Cloud SQL(Postgres, `playpop-api` 인스턴스,
> Cloud SQL Auth Proxy 로만 접속 — 공개망 노출 없음) 배포 완료. 서비스 URL은 배포 로그 참조(비공개 유지).
>
> ✅ **P1(지갑 미러링, 다이아+코인)**: §2 를 실제 구현하며 **"덮어쓰기"에서 "추가만(fire-and-forget 미러링)"으로
> 방향을 한 번 더 정정했다** — 이유는 §2-1. 리그별·컬렉션 카드는 지갑 밖 진행도라 범위 밖(로컬 그대로).
>
> ✅ **P2(리그 밴드 매칭 인프라)**: §4 설계를 Postgres 로 이식·배포. **클라 순위표는 아직 이걸 안 쓴다**
> (로컬 `logic/league.ts` 그대로) — 서버는 판 결과(승리만) 미러링으로 밴드 집계를 쌓아 두고, 봇 명단
> 알고리즘은 밴드 데이터가 없을 때 클라와 **정확히 같은 값**(골든 테스트로 고정)을 내도록만 검증해
> 뒀다. 실제 전환(클라가 `GET /league/roster`를 부르게 하는 것)은 별도 검증 후 §6 P2 항목 참조.
>
> ✅ **P3(순위표 서버 전환, 로컬 폴백 유지)**: `logic/league.ts` `buildRoster`가 서버 캐시를 **먼저** 보고,
> 없으면(오프라인·아직 못 받음) 기존 로컬 알고리즘으로 폴백한다. `HomeScene.create()`가 홈 진입마다
> 오늘·어제 명단을 `prefetchLeagueRoster()`로 미리 받아 캐시를 채운다 — `standings()`·`settleLeague()`
> 등 호출부는 **한 글자도 안 바꿨다**(§3.4 "클라 변경 최소화" 원칙 그대로). 실제 배포 검증 중 두 가지
> 진짜 버그를 찾아 함께 고쳤다:
> 1. **CORS 미설정** — 서버가 `Access-Control-Allow-Origin`을 안 줘서 브라우저에서의 모든 P1~P3 호출이
>    (curl 검증만 통과하고) 조용히 실패하고 있었다. `@fastify/cors` 추가로 해결 — 이게 없었으면 이번
>    세션에서 만든 서버 연동 전체가 배포는 됐지만 **실제로는 한 번도 작동하지 않았을 것**이다.
> 2. **`scripts/qa-league.mjs`가 죽은 세이브 키(`solitaire_save_v3`)를 쓰고 있었다**(2026-08-31 `v4` 전원
>    리셋 때 갱신이 빠짐, 이번 세션 이전의 기존 버그) — 하네스가 조용히 늘 실패해 왔다. `v4`로 고치고
>    재확인(5/5 통과). P3 와 무관한 사전 결함이라 P3 롤아웃 자체를 막지는 않았지만, **검증 자체가 안
>    되고 있었다**는 점에서 이번에 발견 즉시 고쳤다. 같은 죽은 키를 쓰는 스크립트가 더 있다
>    (`measure-klondike-mission.mjs`·`measure-textures.mjs`·`qa-bonus.mjs`) — 이번 범위 밖이라 안 고침.
>
> ✅ **구글 계정 연동**(2026-09-01, 사용자 지시로 P3 이후 별도 착수 — 소셜은 애초 이번 세션 범위 밖이었으나
> 유저가 직접 요청해 진행): 지금까지의 익명 계정(`lib/auth.ts` 기기키 HMAC)에 **구글 신원을 덧붙이는**
> 방식 — 새 계정을 만들지 않아 기존 진행도가 그대로 유지된다. 서버는 `play.identity`(`db/003_identity.sql`,
> provider+provider_user_id → userId) + `POST /api/v1/auth/google`(구글 ID 토큰을 `google-auth-library`로
> 직접 검증, 이메일이 아니라 **구글 `sub`만 신뢰**). 클라는 `ui/googleSignIn.ts`가 Google Identity
> Services 공식 버튼(iframe)을 캔버스 위 DOM 오버레이로 얹는다(`profilePopup.ts` "계정 연동" 절) —
> `logic/serverSync.ts`의 `googleLogin()`이 지금 로그인된 세션 토큰을 함께 실어 보내 **연동 대상 계정**을
> 알려준다. OAuth 클라이언트는 별도 GCP 프로젝트(`ryanlogicgame`)에서 사용자가 직접 발급(Client ID는
> 코드에 상수로 박혀 있다 — 공개 정보라 비밀로 취급할 필요 없음, Client Secret 은 아예 안 씀).
> ⚠️ 세션 토큰이 만료(30일)되면 `apiClient.ts`의 자동 재로그인이 **기기 키로 돌아간다**(구글 idToken 을
> 다시 요구할 수 없어서 — 유저 상호작용 필요). 같은 기기에서는 문제없이 이어지지만, 30일 넘게 그 기기를
> 안 켜다가 다시 켠 경우 자동으로는 익명 상태로 보일 수 있다 — 재로그인 버튼을 다시 누르면 같은 구글
> 계정이므로 정확히 그 계정으로 돌아온다(데이터 유실 없음, 다만 유저가 한 번 더 눌러야 함).
> 검증: `apps/api` 신규 6개 테스트(연동·재로그인·검증실패·지갑접근) + 실제 배포 서버에 잘못된 토큰으로
> 401 확인 + 헤드리스로 구글 공식 버튼(iframe)이 실제로 렌더링되는 것까지 확인.

---

## 0-0. 확정 사항 — 여기만 읽어도 된다

| 항목 | 확정 | 근거 |
|---|---|---|
| **인프라** | **Cloudflare(정적·CDN) + Cloud Run(Fastify, `apps/api`) + Cloud SQL(Postgres)** — 펌프러시와 **같은 인스턴스** | §0-1 |
| 컴퓨트 런타임 | Workers 아님, **Cloud Run 컨테이너** — Fastify·kysely·`pg` 무변경 이식 | §0-1 |
| 서비스 분리 | **새 서비스 만들지 않는다.** `apps/api` 를 `X-Tenant: game:solitaire` 로 멀티테넌트 재사용 | §1 |
| 지갑 | 서버 권위(코인·다이아). 클라는 금액을 안 보낸다(사유만) | §2 |
| 타워 상태(층·컬렉션·미션) | **로컬 우선, 서버는 스냅샷 백업** — 매 건설마다 왕복하지 않는다 | §3 |
| 리그(투데이 리그) | 서버 이전 대상이지만 **P2 로 미룬다** — 지금은 봇 시뮬레이션 유지 | §4 |
| 인증 | `apps/api` 기존 익명 인증 그대로 + 소셜 연동은 플랫폼 공통 작업(게임별 중복 안 함) | §5 |

---

## 0-1. 왜 Workers 안이 아니라 Cloud Run 인가 — 방향 정정

이전에 이 대화에서 솔리테어를 위해 Cloudflare Workers + D1 + Durable Objects 스택을 별도로 설계했다
(`docs/CLOUDFLARE_BACKEND_ARCHITECTURE.md`). 그런데 **같은 리포에서 먼저 이 결정을 실제로 내린 게임
(펌프러시)이 있고, 그 결정은 Cloud Run 이다** — 이유를 무시하고 다른 런타임으로 가면 다음이 생긴다:

1. **`apps/api` 를 두 벌 유지하게 된다.** 펌프러시는 Fastify(Cloud Run), 솔리테어는 Hono(Workers) 라면
   같은 도메인 로직(`domain/grant.ts` 등)을 **두 라우팅 레이어에서 각각 이식·유지**해야 한다 — 모듈러
   모놀리스로 여러 게임이 붙는다는 애초 설계 전제가 깨진다.
2. **포팅 비용이 실측으로 이미 알려져 있다.** 펌프러시 문서 §12-1 은 Vercel 에 Fastify 를 얹으려다 **4번
   싸운 커밋**을 근거로 든다(tsconfig, 핸들러 형태, import 경로, 마이그레이션 예외). Workers 로 가면
   `node:crypto`→WebCrypto, kysely-postgres→kysely-d1, Fastify→Hono 를 **똑같은 종류의 포팅**으로 다시
   치른다 — 이번엔 두 게임이 각자 다른 런타임을 쓰게 되는 대가까지 얹어서.
3. **Cloud Run 은 이 포팅이 구조적으로 없다.** "로컬에서 돌던 Fastify 가 그대로 뜬다"(컨테이너이므로) —
   펌프러시 문서가 Cloud Run 을 고른 핵심 이유가 정확히 이거고, 솔리테어에도 그대로 적용된다.
4. **비용 차이가 없다**(펌프러시 §0-1 표, "세로줄이 안 바뀐다") — Cloud Run 도 요청 없으면 0 으로
   내려간다. Workers 안이 갖는 "유휴비용 0" 이점이 Cloud Run 대비 결정적 우위가 아니다.

**Durable Objects 의 장점(멱등 직렬화·리더보드) 자체는 여전히 유효한 아이디어다** — 다만 그건 "Postgres
unique constraint + 트랜잭션"으로도 이미 충분히 풀리는 문제이고(`apps/api` 의 `wallet_ledger_idem_uq` 가
이미 이 패턴), 그 이점 하나 때문에 런타임을 통째로 가를 근거는 못 된다. **번복한다 — 솔리테어도 펌프러시와
같은 스택.**

---

## 1. 서비스 구조 — 새로 안 만들고 얹는다

```
apps/api (Cloud Run, 1개 인스턴스, 여러 게임 공유)
  X-Tenant: game:pumprush   → 펌프러시 데이터(격리)
  X-Tenant: game:solitaire  → 솔리테어 데이터(격리)   ← 이번에 추가
```

- 도메인 로직(`domain/grant.ts`, `lib/envelope.ts`, `lib/auth.ts`)은 **무변경**. 솔리테어가 추가하는 건
  ① `play.save` 에 저장될 세이브 블롭의 **내용**(불투명, 서버는 해석 안 함) ② 지갑 grant 의 `source` 카탈로그
  항목(예: `solitaire:clear_reward`, `solitaire:league_grand`) ③ (P2) 리그 도메인 모듈 하나.
- **`X-Tenant` 격리로 이미 다중 게임을 전제로 설계돼 있다**(`domain/types.ts` `Tenant = 'platform' | 'game:<id>'`)
  — 솔리테어를 붙이는 건 신규 배포가 아니라 **이 인스턴스에 클라이언트 하나 더 붙이는 것**.

---

## 2. 상태 권위 분류 — 무엇을 서버가 갖고, 무엇을 클라가 갖나

솔리테어 `save.ts` 의 필드를 셋으로 나눈다(펌프러시 문서의 "상태 권위 분류"와 같은 틀):

| 분류 | 필드 예 | 권위 | 이유 |
|---|---|---|---|
| **G1 — 서버 권위(지갑)** | `coins`, `diamonds` | **서버**(`apps/api` wallet, 이미 구현됨) | 재화는 위조 방지가 최우선 — 기존 `POST /wallet/grant` 그대로 사용 |
| **G2 — 로컬 우선 + 백업 스냅샷** | `builtFloors`, `lot2Floors`, `hotelFloors`, `collection`, `missionReward`, `playedLevels` | **클라**(지금처럼 `localStorage`), 서버는 `play.save` 에 **주기적 스냅샷만** | 이 값들은 "위조해서 얻을 이득"이 지갑만큼 크지 않고(타워 층수를 조작해도 재화가 안 늘어남 — 건설은 이미 지갑 차감을 거친 결과), 매 건설마다 서버 왕복을 걸면 지금의 즉시 반응 연출(크레인 애니메이션 등)이 깨진다 |
| **G3 — 정산 이벤트(런 검증 대상)** | 레벨 클리어 결과(별 등급) → `clearRewardsForGrade` 가 계산하는 코인·다이아·리그별 | **서버가 결과를 받아 grant** | 클라는 "어떤 레벨을 몇 별로 깼다"를 신고하고, 금액은 서버 카탈로그가 계산 — 펌프러시의 G1(지갑)과 동일 원칙 |

**결론**: 타워를 통째로 서버 트랜잭션으로 만들 필요가 없다 — **지갑(코인·다이아)만 서버 권위로 옮기고,
나머지는 지금 구조(로컬 `save.ts`)에 "가끔 서버로 스냅샷 백업"만 얹는다.** 이게 펌프러시가 이미 확정한
"`save.ts` 동기 API 유지 + 뒤에 로컬 복제본과 아웃박스"와 정확히 같은 모양이다 — 씬 코드(HomeScene.ts 등)
는 고치지 않는다.

### 2-1. 실제 구현에서 한 번 더 정정 — "덮어쓰기"가 아니라 "추가만"(2026-09-01)

위 표의 G1 예시에 `diamonds`가 들어 있고, P1 계획(§6)도 "서버 응답을 신뢰값으로 덮어쓰기"라고 적었었다.
막상 구현하면서 확인해보니 **다이아는 로컬에 `clearRewardsForGrade`/`leagueGrandDiamonds` 말고도 출처가
훨씬 많다**(컬렉션 세트 완성, 주간 이벤트, 상점 구매/환불 등 — `save.ts` 전체를 훑으면 `save.diamonds`를
바꾸는 지점이 10곳이 넘는다). 이 상태에서 "서버 지갑 값으로 로컬을 덮어쓴다"를 그대로 실행하면, 서버가
아직 모르는 그 나머지 출처의 다이아가 **한 번의 동기화로 사라진다** — 라이브 게임에서 절대 안 될 회귀다.

그래서 실제 구현은 계획을 좁혀서 안전하게 냈다:

- 서버에 새 보상 출처 두 개만 추가 — `solitaire_clear_reward`(등급 1~5 신고 → 서버가 4등급 이상만 1다이아
  계산, `apps/api/src/domain/rewards.ts` `solitaireClearReward()`) · `solitaire_league_grand`(이미 있던 것).
- 클라(`src/logic/serverSync.ts` `mirrorClearReward`/`mirrorLeagueGrand`)는 이 두 이벤트가 로컬에 **이미
  확정된 뒤** 서버에도 같은 사실을 **추가로**(멱등키로 1회) 기록한다 — fire-and-forget, 응답을 기다리지도
  로컬 값을 바꾸지도 않는다. 실패해도(오프라인 등) 게임에 아무 영향이 없다.
- **로컬 `save.ts`는 계속 유일한 권위**다. 서버 지갑은 지금 단계에서는 "다이아 지급 이벤트의 감사 원장"
  일 뿐 — 잔액 조회(`GET /wallet`)로 로컬을 검증하거나 되돌리는 로직은 아직 없다.
- 진짜 "서버 지갑이 로컬을 덮어쓰는" 전환은 **다이아의 모든 출처를 서버 카탈로그로 옮긴 뒤**(코인의
  `starCoinsAt` 곡선까지 포함하면 더 큰 작업)에나 안전하다 — 그건 아직 하지 않았고, 필요해지면 이 절을
  갱신한다.
- 검증: `apps/api/src/domain/rewards.test.ts`(등급→다이아 매핑 8건) + `routes/api.test.ts`(라이브 API
  왕복·멱등 2건) + 배포된 서비스에 직접 `curl` 로 확인(등급 3→0다이아, 5→1다이아, 그랜드→누적 반영).

⚠️ **런 검증(G3) 은 지금 당장 필요 없다.** 클라가 신고하는 별 등급을 서버가 그대로 믿는 것으로 시작해도
된다(펌프러시가 "V1+V2 에서 종료, 완전 리플레이 제외"로 정한 것과 같은 수위) — 솔리테어는 명예 랭킹도
아니고 리그 보상이 크지 않아 더더욱 정밀 검증이 급하지 않다.

---

## 3. 이 게임 특유의 것 — 타워/컬렉션이 크다

솔리테어 세이브는 펌프러시보다 **필드 수가 훨씬 많다**(층수 3계열·컬렉션 15세트·미션·이벤트 등, `save.ts`
의 `loadSave()` 화이트리스트가 이미 40개 이상). 이걸 `play.save` JSONB 블롭 하나에 그대로 넣으면:

- **장점**: 서버가 스키마 마이그레이션 없이 받는다(`server 는 내용을 해석하지 않는다` 원칙 그대로 유지) —
  이번 세션에서 층 해금 곡선을 3번 갈아엎었던 것처럼 **밸런스 값이 자주 바뀌는 게임**이라, 서버가 구조를
  안다고 가정하면 그때마다 서버 스키마도 손대야 한다. 블롭으로 두면 게임 쪽만 바뀐다.
- **주의**: 블롭 크기가 자란다 — 지금 `cardLevels.json` 이 이미 10MB 급이라는 걸 감안하면 **`save`
  블롭에는 진행 상태만**(레벨팩 자체는 정적 에셋, 세이브에 안 들어감) 담기게 이미 잘 분리돼 있다(확인함).
- **컬렉션·미션 보상표**(`economyRules.ts` 등)는 클라·서버가 같은 로직을 공유할 필요가 **없다** — G2 로
  분류돼 서버가 계산에 관여하지 않기 때문. G3(레벨 클리어 보상)만 서버 카탈로그가 필요.

---

## 4. 투데이 리그 — 서버 이전은 P2

지난 대화에서 설계한 "레벨 밴드 기준 봇 티어 매칭"(`docs/CLOUDFLARE_SERVER_STRATEGY.md`)은 **개념은
유효하지만 실행 순서를 뒤로 민다** — 이유:

1. 지갑(G1)이 먼저 서버로 가야 리그 그랜드 다이아 지급도 서버 권위 트랜잭션에 올라탈 수 있다(순서 의존).
2. 리그는 지금도 순수 클라 시뮬레이션으로 **작동은 하고 있다**(봇 99명, 날짜 시드) — 급한 게 아니다.
3. `docs/CLOUDFLARE_SERVER_STRATEGY.md` 의 설계(밴드별 봇 명단, `player_tier` 테이블)는 **Cloud Run+Postgres
   로 그대로 옮겨 쓸 수 있다** — Durable Object 자리를 Postgres 트랜잭션(행 락)으로 바꾸면 된다. 설계
   내용은 안 버린다, 런타임만 다시 맞춘다(P2 착수 시 이 문서에 반영).

---

## 5. 인증 — 게임별로 새로 안 만든다

`docs/CLOUDFLARE_AUTH_DESIGN.md` 에서 설계한 "account/identity 분리·소셜 연동" 은 **플랫폼 공통 작업**이다
(`apps/api` 의 `auth` 모듈 하나를 모든 게임이 공유). 솔리테어가 따로 로그인 시스템을 만들 필요는 없고,
붙는 시점에 **그 공통 auth 모듈이 몇 단계까지 와 있느냐**를 그대로 쓴다. 단, 런타임 결론은 §0-1 을 따라
**WebCrypto 이식판이 아니라 Node(`node:crypto`) 원본 그대로**(Cloud Run 은 Node 컨테이너라 이식 불필요) —
`CLOUDFLARE_AUTH_DESIGN.md` §4.1 의 WebCrypto 포팅 코드는 **적용 대상이 없어졌다**(Workers 를 안 쓰므로).
스키마 설계(account/identity 분리, §2)는 Postgres 로 그대로 유효하다.

---

## 6. 착수 순서 (P0~P3)

| 단계 | 내용 |
|---|---|
| **P0** | ✅ 완료(2026-09-01). `apps/api` 를 Cloud Run(`playpop-api`, asia-northeast3) + Cloud SQL 로 배포. `X-Tenant: game:solitaire` 로 지갑 격리 확인. |
| **P1** | ✅ 완료(2026-09-01, §2-1 로 범위 축소·확장). 레벨 클리어(다이아+코인)·리그 그랜드(다이아) 를 `POST /wallet/grant`(`solitaire_clear_reward`/`solitaire_league_grand`)로 **추가 미러링**(`src/logic/serverSync.ts`) — 로컬 `save.ts`는 그대로 권위 유지, 서버는 감사 원장(코인은 `DEFAULT_ECON` 고정 사본 기반 근사값, §2-1). 타워(G2) 상태는 `backupTowerSnapshot()`이 `PUT /api/v1/save/solitaire-heights`로 **가끔**(5분 스로틀) 통째로 백업 — 기기 분실 시 복구용, 실시간 동기화 아님. |
| **P2** | ✅ 인프라 완료(2026-09-01, §4 설계 그대로 Postgres 로 이식). `play.player_tier`(`db/002_league_tier.sql`) + `domain/leagueTier.ts`(EMA 밴드 집계 + 봇 명단 알고리즘) + `POST /api/v1/league/round-report` · `GET /api/v1/league/roster`. `mirrorRoundReport()`(승리 판만)가 밴드 집계를 쌓는다. `buildRosterForBand(periodId, null)`은 밴드 데이터가 없을 때 **클라 로컬 `buildRoster(periodId)`와 정확히 동일한 출력**을 내도록 골든값으로 고정해 뒀다(`domain/leagueTier.test.ts`). |
| **P3** | ✅ 완료(2026-09-01). `logic/league.ts` `buildRoster`가 `setServerRoster()` 캐시를 우선 조회하고 없으면 로컬 폴백 — `standings`·`settleLeague`·UI(`leaguePanel.ts`·`leagueRail.ts`) 호출부는 무변경. `HomeScene.create()`가 홈 진입마다 `prefetchLeagueRoster(오늘)`+`prefetchLeagueRoster(어제)`를 fire-and-forget으로 호출해 캐시를 채운다. 검증 중 CORS 미설정(서버가 실제로는 브라우저 호출을 전부 거부하고 있었다)과 `qa-league.mjs`의 죽은 세이브 키(사전 결함) 두 가지 진짜 버그를 발견해 함께 고쳤다(§ 상단 배지 참조) — `npm run qa:league` 5/5 통과로 재확인. 계정 연동(소셜)·다이아 전 출처 서버화(§2-1 "덮어쓰기" 전환)·코인 전환·리그 밴드 배율의 PO 검토는 착수 전. |

**요약**: 이 게임도 **서버에 붙일 준비가 구조적으로 되어 있다**(로컬 세이브가 이미 블롭 형태, 지갑 필드가
분리돼 있음). 진짜 일은 "새 인프라를 짓는 것"이 아니라 **펌프러시가 이미 만드는 `apps/api` 인스턴스에
두 번째 게임으로 올라타는 것**이고, 그 편이 Cloudflare Workers 로 별도 스택을 짓는 것보다 포팅 비용·유지
비용 둘 다 낮다.
