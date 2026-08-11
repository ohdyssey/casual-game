-- 틱택토 네온 실시간 1v1 대전 — 초기 스키마.
--
-- 구역 분리: 이 게임의 테이블은 전부 **`ttt` 스키마** 안에만 둔다.
--   · `public` 은 플랫폼 공용(계정·지갑·랭킹)을 위해 비워 둔다 — 게임이 20개로 늘어도
--     `players` 같은 흔한 이름이 서로 부딪히지 않는다.
--   · 나중에 틱택토만 별도 DB 로 떼어내야 할 때도 이 스키마만 통째로 옮기면 된다.
--   ⚠️ 이 스키마를 쓰려면 Supabase 대시보드에서
--      Settings → API → **Exposed schemas 에 `ttt` 를 추가**해야 한다.
--      ⚠️⚠️ "클라가 DB 를 직접 안 읽으니 필요 없다" 고 착각하기 쉽다(2026-08-11 실제로 틀렸다).
--        **서버도 PostgREST 를 거친다** — `repo.ts` 의 `serviceClient().schema('ttt')` 는
--        `/rest/v1/` 호출이고, service_role 은 RLS 만 우회할 뿐 이 화이트리스트는 똑같이 받는다.
--        빠져 있으면 service_role 로도 `PGRST106 Invalid schema: ttt` (HTTP 406) 다.
--      · 반면 Realtime 구독은 publication+RLS 로 돌아 이 설정과 무관하다.
--
-- 권위 분리: 클라이언트는 **읽기만** 직접 하고(RLS 로 참가자 제한), 모든 쓰기는
-- Vercel 서버리스 함수(service_role)를 통과한다. 그래서 insert/update/delete 정책을
-- **일부러 만들지 않는다** — 정책이 없으면 RLS 가 전부 거부하고 service_role 만 우회한다.
--
-- 리전: ap-northeast-2(서울). Vercel 함수도 icn1 로 맞춰 왕복을 짧게 유지한다.

create schema if not exists ttt;

-- API 롤이 이 스키마에 들어올 수 있게. (실제 접근 범위는 아래 RLS + GRANT 가 정한다)
grant usage on schema ttt to anon, authenticated, service_role;

-- ───────────────────────── 플레이어 ─────────────────────────
-- 레이팅 서버 권위. 클라의 localStorage(tictactoe_v3_versus)는 이제 표시용 캐시일 뿐이다.
create table if not exists ttt.players (
  id         uuid primary key references auth.users(id) on delete cascade,
  nickname   text        not null default '',
  rating     int         not null default 1200,
  wins       int         not null default 0,
  losses     int         not null default 0,
  draws      int         not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── 매칭 대기열 ─────────────────────────
-- 클라는 이 테이블을 절대 읽지 않는다(GRANT 도 RLS 정책도 주지 않는다). 페어링은 서버 전용.
-- 한 유저가 두 번 줄 서지 못하도록 user_id 를 PK 로 둔다.
create table if not exists ttt.match_queue (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  rating    int         not null,
  joined_at timestamptz not null default now()
);
create index if not exists match_queue_joined_at_idx on ttt.match_queue (joined_at);

-- ───────────────────────── 매치 ─────────────────────────
do $$ begin
  create type ttt.match_status as enum ('playing', 'finished', 'abandoned');
exception when duplicate_object then null; end $$;

do $$ begin
  -- 'line'=3목, 'timeout'=시간초과, 'draw'=수 상한, 'resign'=포기, 'disconnect'=이탈
  create type ttt.match_cause as enum ('line', 'timeout', 'draw', 'resign', 'disconnect');
exception when duplicate_object then null; end $$;

create table if not exists ttt.matches (
  id            uuid primary key default gen_random_uuid(),
  -- 먼저 줄 서서 기다리던 쪽이 항상 o_player 다. 그래야 대기자가 Realtime 을
  -- `o_player=eq.<내uid>` 필터 하나로 구독해 매칭 성사를 알 수 있다(폴링 불필요).
  o_player      uuid not null references auth.users(id),
  x_player      uuid not null references auth.users(id),
  -- 정산 시점이 아니라 **매치 시작 시점**의 레이팅으로 Elo 를 계산한다
  -- (대기 중 다른 판이 끝나 레이팅이 변해도 이 판의 보상이 흔들리지 않게).
  o_rating_at   int  not null,
  x_rating_at   int  not null,
  -- board.ts 의 GameState 를 그대로 담는다. 절대 심볼(O/X) 기준 — 화면 표시용 뒤집기는 클라가 한다.
  state         jsonb not null,
  -- 단조 증가 카운터. 모든 상태 변경 UPDATE 가 `and move_index = $n` 조건을 달아
  -- 재전송·동시요청·"타임아웃 주장과 착수가 겹치는" 경합에서 하나만 성공하게 만든다.
  move_index    int  not null default 0,
  -- 무승부 상한(DRAW_MOVE_CAP=60) 판정용 누적 착수 수. move_index 와 같은 값이지만
  -- 의미가 다르므로(하나는 동시성 토큰, 하나는 게임 규칙) 분리해 둔다.
  move_count    int  not null default 0,
  -- 현재 턴의 마감 시각(서버 벽시계 권위). 클라 타이머는 이 값을 그리기만 한다.
  turn_deadline timestamptz not null,
  status        ttt.match_status not null default 'playing',
  winner        text,  -- 'O' | 'X' | null(무승부)
  cause         ttt.match_cause,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint matches_distinct_players check (o_player <> x_player),
  constraint matches_winner_symbol check (winner is null or winner in ('O', 'X'))
);

-- 진행 중인 판만 찾으면 되므로 부분 인덱스로 충분하다.
create index if not exists matches_o_player_idx on ttt.matches (o_player) where status = 'playing';
create index if not exists matches_x_player_idx on ttt.matches (x_player) where status = 'playing';
create index if not exists matches_sweep_idx    on ttt.matches (turn_deadline) where status = 'playing';

-- ───────────────────────── 권한 ─────────────────────────
-- 서버(service_role)는 전부. 클라(authenticated)는 자기 관련 행 **읽기만**.
grant all on all tables in schema ttt to service_role;
grant all on all sequences in schema ttt to service_role;
alter default privileges in schema ttt grant all on tables to service_role;
alter default privileges in schema ttt grant all on sequences to service_role;

-- Realtime 이 RLS 를 검사할 때도 이 SELECT 권한이 필요하다.
grant select on ttt.matches to authenticated;
grant select on ttt.players to authenticated;
-- ttt.match_queue 에는 아무 권한도 주지 않는다(대기열은 서버만 본다).

-- ───────────────────────── RLS ─────────────────────────
alter table ttt.players     enable row level security;
alter table ttt.match_queue enable row level security;
alter table ttt.matches     enable row level security;

drop policy if exists "own player row" on ttt.players;
create policy "own player row" on ttt.players
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "participants read match" on ttt.matches;
create policy "participants read match" on ttt.matches
  for select to authenticated
  using (o_player = auth.uid() or x_player = auth.uid());

-- matches/players 에 insert/update/delete 정책은 만들지 않는다 → 쓰기는 서버 독점.
-- match_queue 에는 정책이 하나도 없다 → 클라 접근 전면 차단.

-- ───────────────────────── Realtime ─────────────────────────
-- postgres_changes 는 대상 테이블의 RLS 를 그대로 따르므로, 위 SELECT 정책만으로
-- "참가자에게만 자기 매치가 푸시됨" 이 성립한다(realtime.messages 정책 불필요).
do $$ begin
  alter publication supabase_realtime add table ttt.matches;
exception when duplicate_object then null; end $$;

-- 구독 필터가 **기본키가 아닌 컬럼**을 볼 수 있게 한다. 기본값(default)이면 UPDATE 의 WAL 에
-- 기본키만 실려서 `o_player=eq...` 같은 필터가 대상 컬럼 값을 읽지 못한다.
-- (현재 UPDATE 구독 필터는 `id=eq...` 뿐이고 `payload.old` 를 읽는 코드도 없으므로 지금 당장
--  꼭 필요하진 않다. 다만 필터를 하나만 바꿔도 조용히 깨지는 자리라 켜 둔 채로 간다 —
--  대신 UPDATE 마다 전체 행이 WAL 에 실리는 비용이 있다는 걸 알고 있을 것.)
alter table ttt.matches replica identity full;

-- ───────────────────────── 플레이어 보장 ─────────────────────────
-- 익명 로그인 직후 players 행이 없다. 없으면 만들고, 있으면 그대로 두고 현재 값을 돌려준다.
-- (닉네임은 최초 1회만 쓴다 — 나중에 유저가 바꿔도 덮어쓰지 않게)
create or replace function ttt.ensure_player(p_user uuid, p_nickname text)
returns table (rating int, nickname text, wins int, losses int, draws int)
language plpgsql
security definer
set search_path = ttt, public
as $$
begin
  insert into ttt.players (id, nickname) values (p_user, p_nickname)
  on conflict (id) do nothing;

  return query
    select p.rating, p.nickname, p.wins, p.losses, p.draws
      from ttt.players p where p.id = p_user;
end $$;

revoke all on function ttt.ensure_player(uuid, text) from public, anon, authenticated;
grant execute on function ttt.ensure_player(uuid, text) to service_role;

-- ───────────────────────── 정산 반영 ─────────────────────────
-- 레이팅은 절대값으로 덮고(매치 시작 시점 기준으로 이미 계산됨), 전적은 증분한다.
-- 증분을 SQL 에서 하는 이유: 읽고-고쳐-쓰면 같은 유저의 두 판이 동시에 끝날 때 하나가 사라진다.
create or replace function ttt.settle_player(p_user uuid, p_rating int, p_outcome text)
returns void
language sql
security definer
set search_path = ttt, public
as $$
  update ttt.players
     set rating     = p_rating,
         wins       = wins   + case when p_outcome = 'win'  then 1 else 0 end,
         losses     = losses + case when p_outcome = 'loss' then 1 else 0 end,
         draws      = draws  + case when p_outcome = 'draw' then 1 else 0 end,
         updated_at = now()
   where id = p_user;
$$;

revoke all on function ttt.settle_player(uuid, int, text) from public, anon, authenticated;
grant execute on function ttt.settle_player(uuid, int, text) to service_role;

-- ───────────────────────── 페어링 (원자적) ─────────────────────────
-- 대기열에서 나 아닌 사람 1명을 SKIP LOCKED 로 집어 매치를 만든다.
-- 두 사람이 동시에 join 해도 같은 상대를 두 번 집지 못한다.
create or replace function ttt.join_queue(
  p_user    uuid,
  p_rating  int,
  p_turn_ms int,
  p_first   text  -- 선공 심볼 'O' | 'X' (서버가 랜덤 결정해 넘긴다)
)
returns table (matched boolean, match_id uuid)
language plpgsql
security definer
set search_path = ttt, public
as $$
declare
  v_foe   ttt.match_queue%rowtype;
  v_match uuid;
begin
  -- 이미 큐에 있으면 중복 등록하지 않는다(재시도 안전).
  delete from ttt.match_queue where user_id = p_user;

  select * into v_foe
    from ttt.match_queue
   where user_id <> p_user
   order by joined_at
   for update skip locked
   limit 1;

  if v_foe.user_id is null then
    insert into ttt.match_queue (user_id, rating) values (p_user, p_rating);
    return query select false, null::uuid;
    return;
  end if;

  delete from ttt.match_queue where user_id = v_foe.user_id;

  -- 기다리던 쪽(v_foe)이 O, 방금 들어와 성사시킨 쪽(p_user)이 X.
  insert into ttt.matches (o_player, x_player, o_rating_at, x_rating_at, state, turn_deadline)
  values (
    v_foe.user_id, p_user, v_foe.rating, p_rating,
    jsonb_build_object(
      'pieces', jsonb_build_object('O', '[]'::jsonb, 'X', '[]'::jsonb),
      'turn', p_first, 'winner', null, 'winLine', null
    ),
    now() + make_interval(secs => p_turn_ms / 1000.0)
  )
  returning id into v_match;

  return query select true, v_match;
end $$;

revoke all on function ttt.join_queue(uuid, int, int, text) from public, anon, authenticated;
grant execute on function ttt.join_queue(uuid, int, int, text) to service_role;

-- ───────────────────────── 유령 매치 청소 ─────────────────────────
-- 양쪽이 다 이탈하면 아무도 timeout 을 주장하지 않는다. 데드라인이 한참 지난 판을 정리한다.
-- pg_cron 이 없는 환경(로컬 등)에서는 조용히 건너뛴다.
--
-- ⚠️ 예외 조건명은 `invalid_schema_name`(3F000) 이다. `undefined_schema` 라는 조건명은
--    PostgreSQL 에 **없다** — plpgsql 은 조건명을 컴파일 시점에 확인하므로, 없는 이름을 쓰면
--    pg_cron 이 켜져 있든 없든 `unrecognized exception condition` 으로 이 블록이 죽고,
--    스크립트 한 트랜잭션이 통째로 롤백된다(2026-08-11 실제로 밟았다).
do $$ begin
  perform cron.schedule(
    'ttt-sweep-abandoned',
    '* * * * *',
    $sweep$
      update ttt.matches
         set status = 'abandoned', updated_at = now()
       where status = 'playing'
         and turn_deadline < now() - interval '2 minutes'
    $sweep$
  );
exception when undefined_function or invalid_schema_name then
  raise notice 'pg_cron 미설치 — 유령 매치 스윕을 건너뜁니다(로컬 개발에서는 정상).';
end $$;
