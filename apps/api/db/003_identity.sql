-- 소셜 계정 연동 — 외부 신원(Google 등) → 영구 userId 매핑.
--
-- ⚠️ 익명 로그인의 userId 는 기기 키의 HMAC 파생값이라 DB 에 저장할 필요가 없었다(`lib/auth.ts`).
--   소셜 신원은 기기와 무관하게 **재현 불가능한 외부 id**(구글 sub 등)라 매핑을 저장해야
--   같은 계정으로 여러 기기에서 로그인할 수 있다.
--
-- 링크 정책: 처음 그 신원으로 로그인하면 **그 요청의 현재 세션(있다면 익명 계정)에 연결**한다 —
--   이미 쌓인 진행도가 사라지지 않게. 두 번째부터는 이 테이블에서 찾아 그 userId 로 로그인시킨다.

CREATE TABLE IF NOT EXISTS play.identity (
  provider          TEXT        NOT NULL,   -- 'google' 등.
  provider_user_id  TEXT        NOT NULL,   -- 그 provider 안에서의 안정 id(구글 sub).
  user_id           TEXT        NOT NULL,   -- 이 플랫폼의 영구 userId(익명 계정과 동일 체계).
  email             TEXT,                    -- 표시·문의 대응용(로그인에는 안 씀 — sub 만 신뢰).
  linked_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_user_id)
);

-- "이 userId 에 연동된 신원이 있는가" 조회용(설정 화면 등에서 "Google로 연동됨" 표시).
CREATE INDEX IF NOT EXISTS idx_identity_user ON play.identity (user_id);
