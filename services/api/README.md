# @casual/api — 게임 공용 백엔드 API

Vercel 서버리스 함수 + Supabase(Auth/Postgres/Realtime). **모든 게임이 이 하나의 프로젝트를 쓴다.**
현재 담긴 것은 틱택토 네온의 실시간 1v1 대전(MS 스토어 / 토스 / 구글 / 애플 런칭용).

## 주소 규칙 — 게임과 버전으로 나눈다

```
/api/health                    ← 공용(인증 없음)
/api/v1/ttt/queue/join         ← 틱택토
/api/v1/ttt/match/move
/api/v1/solitare/...           ← (게임이 늘면 폴더만 추가)
```

폴더 구조가 곧 주소다: `api/v1/ttt/match/move.ts` → `POST /api/v1/ttt/match/move`.

⚠️ **`v1` 을 고쳐 쓰지 말 것.** 게임은 구글/애플에 **각각 별도 앱**으로 올라가고, 유저는 앱을
업데이트하지 않는다 — 구버전 앱이 몇 달씩 남는다. 웹은 새로고침하면 최신이지만 앱은 아니다.
계약이 바뀌어야 하면 `v1` 은 그대로 두고 `api/v2/...` 를 **추가**한 뒤 새 앱만 그쪽을 보게 한다.
바뀌는 라우트만 v2 에 두면 되고, 나머지는 v1 을 계속 쓴다.

⚠️ **앱을 오리진으로 구분할 수 없다.** Capacitor 웹뷰의 오리진(`capacitor://localhost` 등)은
앱마다 같은 값이다. 구분이 필요하면 토큰이나 헤더로 한다. CORS 는 보안 경계가 아니며
(브라우저만 지킨다) 실제 방어선은 JWT + RLS 다.

## 왜 이 구조인가

```
   [게임 클라이언트 (Phaser)]
        │  ①읽기: 매치 상태 SELECT (RLS: 참가자만)          ┌──────────────────┐
        ├──────────────────────────────────────────────────►│                  │
        │  ②구독: Realtime postgres_changes (matches)       │    Supabase      │
        │◄──────────────────────────────────────────────────┤  (ap-northeast-2)│
        │  ③인증: signInAnonymously() → JWT                 │  Auth/PG/Realtime│
        │                                                    └────────▲─────────┘
        │  ④쓰기: 착수/큐/타임아웃 (JWT Bearer)                       │ service_role
        ▼                                                             │ (쓰기 독점)
   [Vercel Serverless Functions — services/api, region icn1]──────┘
```

- **상시 WebSocket 서버가 없다.** 20초 턴제라 지속 연결이 필요한 건 "상대 수 푸시" 하나뿐이고,
  그건 Supabase Realtime 이 관리형으로 준다. 서버리스의 약점(장기 연결 불가)이 문제가 되지 않는다.
- **게임 규칙은 한 벌이다.** Vercel 함수가 `@casual/ttt-rules` 의 `applyAction` 을 그대로 import 해
  모든 착수를 재검증한다. plpgsql 로 규칙을 재구현하면 클라와 반드시 어긋난다.
- **클라는 읽기만 직접 한다.** `matches`/`players` 에 insert/update/delete RLS 정책을 만들지 않아서
  (service_role 만 통과) 클라가 DB 를 조작할 경로 자체가 없다.
- **동시성의 축은 `move_index`.** 상태 변경 UPDATE 는 전부 `and move_index = ?` 조건을 달고,
  0행 갱신 = 다른 요청이 먼저 이겼다로 해석한다. 재전송·동시착수·"타임아웃 주장과 착수가 겹침"이 전부 여기서 막힌다.

## 처음 셋업

### 1. Supabase 프로젝트

리전은 **ap-northeast-2(서울)** — Vercel `icn1` 과 맞춰야 왕복이 짧다.

```bash
# 로컬
supabase start
supabase db reset          # supabase/migrations/0001_init.sql 적용

# 원격
supabase link --project-ref <ref>
supabase db push
```

대시보드에서 **Authentication → Sign In / Providers → User Signups → Allow anonymous sign-ins 를 켠다**
(끄면 `anonymous_provider_disabled` 로 로그인이 전부 실패한다).

**Settings → API → Exposed schemas 에 `ttt` 를 추가한다.** 빠지면 큐 진입부터 500
(`player_unavailable`)이다.

⚠️ "클라가 DB 를 직접 안 읽으니 이 설정은 필요 없다"는 착각을 하기 쉽다 — 실제로 한 번 틀렸다.
**서버도 PostgREST 를 거친다.** `repo.ts` 의 `serviceClient().schema('ttt')` 는 `/rest/v1/` 호출이고,
service_role 은 RLS 만 우회할 뿐 노출 스키마 화이트리스트는 똑같이 적용받는다
(빠져 있으면 service_role 로도 `PGRST106 Invalid schema: ttt`, HTTP 406).
Realtime 구독만 publication+RLS 로 돌아 이 설정과 무관하다.

`pg_cron` 이 없으면 마이그레이션이 유령 매치 스윕만 건너뛰고 나머지는 정상 적용된다(로컬은 이게 정상).
운영에서는 Database → Extensions 에서 `pg_cron` 을 켜고 마이그레이션을 다시 적용할 것.

### 2. Vercel 프로젝트

- Root Directory: `services/api`
- **"Include source files outside of the Root Directory" 를 켠다** — npm 워크스페이스(`@casual/ttt-rules`)를 쓰기 때문.
- 환경변수:

| 이름 | 값 |
|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ⚠️ **서버 전용.** 클라 번들에 절대 넣지 않는다 |
| `ALLOWED_ORIGINS` | 쉼표 구분. 웹/허브 · 토스 미니앱 · MS Store 패키지 오리진을 **전부** 넣어야 한다 |

### 3. 게임 클라이언트

`games/TICTACTOE/src/net/config.ts` 의 `SUPABASE_URL` · `SUPABASE_ANON_KEY` 를 실제 값으로 바꾸고,
`API_BASE_BY_TARGET` 을 배포된 Vercel 도메인으로 바꾼다.

> anon key 는 공개 전제 값이다(실제 방어선은 RLS + 서버 함수). service_role 키만 비밀이다.
> 자리표시 상태에서는 `isOnlineEnabled()` 가 false 로 접혀 **Supabase SDK 가 번들에 실리지도 않고**,
> 대전은 전부 봇 폴백으로 돌아간다. 값을 채우면 빌드 산출물에 supabase 청크가 생긴다.

## 로컬 개발

```bash
# 터미널 A — 게임 (6211)
npm run dev:tictactoe

# 터미널 B — API (3000)
npm run dev:api      # = vercel dev --listen 3000
```

브라우저 2탭으로 대전한다. **한쪽은 반드시 시크릿 창** — 익명 세션이 같은 저장소를 공유하면
두 탭이 같은 계정이 되어 매칭이 안 된다.

## 엔드포인트

| | 하는 일 |
|---|---|
| `GET  /api/health` | 배포 스모크·CORS preflight 확인 |
| `POST /api/v1/ttt/queue/join` | 대기열 진입. `for update skip locked` 로 원자적 페어링 |
| `POST /api/v1/ttt/queue/cancel` | 대기열 이탈. 직전에 성사됐으면 그 매치를 함께 돌려준다 |
| `POST /api/v1/ttt/match/move` | 착수 재검증 + 상태 전이 + 종료 시 Elo 정산 |
| `POST /api/v1/ttt/match/timeout` | 시간초과 주장(서버가 자기 시계로 재확인) |
| `POST /api/v1/ttt/match/resign` | 포기 |
| `POST /api/v1/ttt/match/state` | 재동기화(백그라운드 복귀·재접속) |

거부는 HTTP 에러가 아니라 **200 + `{ result: 'rejected', reason, match }`** 다.
"네트워크 문제"와 "규칙 위반"을 클라가 구분할 수 있어야 하기 때문.

## 테스트

```bash
npx vitest run services/api packages/ttt-rules
```

판정 규칙 전체(`matchFlow`)와 정산(`ratings`)이 Supabase 없이 검증된다 — DB 접근(`repo.ts`)과
순수 로직을 분리해 둔 이유다.

## 아직 안 한 것

- 레이팅 윈도우 매칭(지금은 선착순). 초기 동접에서는 매칭이 안 되는 쪽이 더 큰 리스크라 미뤘다.
- Realtime `broadcast_changes` 전환. 동접이 커지면 postgres_changes 대신 이쪽이 유리하다.
- 재접속 유예. 지금은 턴 마감(22초)이 그 역할을 겸한다.
