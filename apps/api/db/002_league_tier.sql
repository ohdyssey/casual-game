-- 투데이 리그 밴드 매칭(P2) — `domain/leagueTier.ts` 참조.
--
-- ⚠️ 결제·이탈확률 등 비공개 신호는 이 테이블에 컬럼으로조차 존재하지 않는다(정책 가드레일,
--   docs/CLOUDFLARE_SERVER_STRATEGY.md §3.1). 입력은 레벨·승패·별 — 전부 유저 화면에 이미 보이는 값.

CREATE TABLE IF NOT EXISTS play.player_tier (
  tenant            TEXT        NOT NULL,
  user_id           TEXT        NOT NULL,
  level_band        INTEGER     NOT NULL DEFAULT 0,
  -- 지수이동평균(EMA) — 무한 이력 테이블 없이 "최근 N판"을 근사한다.
  recent_win_rate   DOUBLE PRECISION NOT NULL DEFAULT 0,
  recent_star_avg   DOUBLE PRECISION NOT NULL DEFAULT 0,
  games_counted     INTEGER     NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant, user_id)
);

-- 밴드별 평균 별(봇 명단 난이도 배율 입력) 조회용.
CREATE INDEX IF NOT EXISTS idx_player_tier_band ON play.player_tier (tenant, level_band);
