# PlayPOP API — S0/S1

캐주얼 게임 백엔드(모듈러 모놀리스, Fastify + Zod).
설계 원본은 [`docs/BACKEND_SYSTEM_ARCHITECTURE.md`](../../docs/BACKEND_SYSTEM_ARCHITECTURE.md) ·
[`docs/GAME_BACKEND_DESIGN.md`](../../docs/GAME_BACKEND_DESIGN.md).

## 지금 구현된 범위

| 단계 | 기능 | 엔드포인트 |
|---|---|---|
| **S0** | 익명 인증(기기 키 → 영구 userId + 서명 토큰) | `POST /api/v1/auth/anon` |
| **S0** | 서버 시간(일일 리셋의 단일 기준 시계) | `GET /api/v1/time` |
| **S0** | 클라우드 세이브(rev 낙관적 동시성) | `GET/PUT /api/v1/save/:gameId` |
| **S1** | 서버 권위 지갑 + 멱등 보상 지급 | `GET /api/v1/wallet` · `POST /api/v1/wallet/grant` |
| — | 프로필 · 헬스체크 | `GET /api/v1/profile` · `GET /health` |

모든 응답은 봉투 형식이다: `{ ok, data, error }`.

## 설계에서 물러서지 않은 지점

- **클라는 금액을 보내지 않는다.** `POST /wallet/grant` 는 `source` 만 받고 지급액은 서버
  카탈로그(`domain/rewards.ts`)가 정한다. 이 규칙이 없으면 서버 지갑은 클라 주장을 받아 적는
  장부일 뿐이고, 지금의 localStorage 치트가 그대로 서버로 승격된다.
- **멱등은 DB 유니크 제약**(`econ.wallet_ledger.idempotency_key`)이다. 애플리케이션 메모리에
  두면 인스턴스가 늘어나는 순간 같은 키가 두 번 적용된다(재화 복제).
- **원장 + 잔액을 한 트랜잭션**으로 움직인다. 잔액만 두면 분쟁·환불·부정탐지가 불가능해진다.
- **세이브는 rev 로 충돌을 드러낸다.** 마지막 쓰기가 조용히 이기면 두 기기 사용자의 진행이 사라진다.
- **개발용 `Bearer anon:<id>` 는 기본 꺼짐.** `ALLOW_DEV_AUTH=1` 일 때만 살아나고,
  `NODE_ENV=production` 이면 시작 자체를 거부한다.

## 실행

```bash
# 필수: 32자 이상 서명 비밀(기본값을 두지 않는다 — 그 값이 그대로 프로덕션에 나간다)
AUTH_SECRET=$(openssl rand -base64 48) npm run start --workspace apps/api

# 개발(자동 재시작 + anon 토큰 허용)
AUTH_SECRET=... ALLOW_DEV_AUTH=1 npm run dev --workspace apps/api

npm run test --workspace apps/api      # 25 테스트
npm run typecheck --workspace apps/api
```

## 저장소

- 기본은 **인메모리**(`adapters/memory.ts`) — 테스트·로컬 전용, 프로세스 종료 시 소멸.
- **Postgres**(`adapters/postgres.ts`, kysely) 구현 완료. 스키마는 `db/001_init.sql`.
  아직 `index.ts` 에 배선하지 않았다 — **실 DB 인스턴스 결정이 남아서**이며,
  결정되면 `memoryDeps()` 대신 `createPgWalletRepo/createPgSaveRepo` 를 주입하면 된다.

## 아직 없는 것 (다음 단계)

- **S2 리그/랭킹 집계** — 지금은 클라 시뮬(`logic/league.ts`).
- **S3 비동기 PVP(리플레이 검증)** — 클라가 `{seed, inputs[]}` 를 제출하면 서버가 게임의
  순수 로직으로 재실행해 점수를 재계산하고, 그 점수로만 보상을 지급한다. 게임의
  `src/logic/*` 이 이미 Phaser 비의존이라 **서버에서 그대로 재사용**할 수 있다.
- **계정 연동(구글/애플)**, IAP 영수증 검증, 리모트 컨피그, 메일박스.
- 배포(Cloud Run) · 레이트리밋 · 관측성.
