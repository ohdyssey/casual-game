-- PlayPOP API — S0/S1 스키마.
--
-- 설계 원칙
--  · 지갑은 **원장(append-only) + 잔액 캐시** 두 벌이다. 원장이 진실이고 잔액은 빠른 조회용.
--    잔액만 두면 "왜 이렇게 됐는지"를 영영 알 수 없고, 분쟁·환불·부정탐지가 불가능해진다.
--  · 멱등은 **DB 유니크 제약**으로 건다. 애플리케이션 메모리에 두면 인스턴스가 늘어나는 순간
--    같은 키가 두 번 적용된다(= 재화 복제).
--  · 테넌트(platform | game:<id>)가 모든 키에 들어간다 — 통합/독립 운영을 한 스키마로 지탱한다.

CREATE SCHEMA IF NOT EXISTS econ;
CREATE SCHEMA IF NOT EXISTS play;

-- ─────────────────────────── 지갑(S1) ───────────────────────────

-- 잔액 캐시. 원장으로부터 파생되지만 조회 경로를 짧게 하려고 물리화한다.
CREATE TABLE IF NOT EXISTS econ.wallet_balance (
  tenant      TEXT        NOT NULL,
  user_id     TEXT        NOT NULL,
  coins       BIGINT      NOT NULL DEFAULT 0 CHECK (coins >= 0),
  gems        BIGINT      NOT NULL DEFAULT 0 CHECK (gems  >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant, user_id)
);

-- 원장 — 지급/차감 1건이 1행. 절대 UPDATE/DELETE 하지 않는다.
CREATE TABLE IF NOT EXISTS econ.wallet_ledger (
  id               BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant           TEXT        NOT NULL,
  user_id          TEXT        NOT NULL,
  source           TEXT        NOT NULL,
  coins_delta      BIGINT      NOT NULL DEFAULT 0,
  gems_delta       BIGINT      NOT NULL DEFAULT 0,
  -- 적용 후 잔액 스냅샷 — 멱등 재요청에 **그때의 잔액**을 그대로 돌려주기 위해 남긴다.
  coins_after      BIGINT      NOT NULL,
  gems_after       BIGINT      NOT NULL,
  idempotency_key  TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ⚠️ 멱등의 실제 방어선. 테넌트별로 유일해야 한다(게임이 다르면 같은 키를 써도 무방).
CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_idem_uq
  ON econ.wallet_ledger (tenant, idempotency_key);

CREATE INDEX IF NOT EXISTS wallet_ledger_user_idx
  ON econ.wallet_ledger (tenant, user_id, created_at DESC);

-- ─────────────────────────── 클라우드 세이브(S0) ───────────────────────────

CREATE TABLE IF NOT EXISTS play.save (
  tenant      TEXT        NOT NULL,
  user_id     TEXT        NOT NULL,
  game_id     TEXT        NOT NULL,
  -- 서버는 내용을 해석하지 않는다. 크기 제한은 애플리케이션(SAVE_MAX_BYTES)에서 건다.
  data        JSONB       NOT NULL,
  -- 낙관적 동시성의 축. 클라가 읽은 rev 와 다르면 쓰지 않는다.
  rev         INTEGER     NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant, user_id, game_id)
);

-- ─────────────────────────── 계정(S0) ───────────────────────────

-- 익명 계정. device_key 는 해시로만 저장한다 — 유출돼도 그대로 로그인에 쓰이지 않게.
CREATE TABLE IF NOT EXISTS play.account (
  user_id          TEXT        PRIMARY KEY,
  device_key_hash  TEXT        NOT NULL UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
