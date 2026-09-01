/**
 * 서버 진입점 — 환경변수로 구성하고 리슨한다. `npm run start`(tsx) 로 실행.
 *
 * 필수: `AUTH_SECRET`(32자 이상). 없으면 **시작 자체를 실패**시킨다 — 개발용 기본값을 두면
 * 그 값이 그대로 프로덕션에 나가기 때문이다.
 * 선택: `PORT`(기본 8787) · `ALLOW_DEV_AUTH=1`(개발에서만).
 *
 * 저장소: `DB_SOCKET_PATH`(Cloud SQL Unix 소켓 경로, 예: `/cloudsql/<connection-name>`)가 있으면
 *   Postgres 를 쓴다 — 없으면 인메모리(로컬 개발 전용, 재시작하면 다 날아간다).
 */
import { Pool } from 'pg';
import { buildServer, memoryDeps, type ServerDeps } from './server.js';
import { readSigningSecret } from './lib/auth.js';
import {
  createDb,
  createPgIdentityRepo,
  createPgLeagueTierRepo,
  createPgSaveRepo,
  createPgWalletRepo,
} from './adapters/postgres.js';

const secret = readSigningSecret();
const allowDevAuth = process.env.ALLOW_DEV_AUTH === '1';
if (allowDevAuth && process.env.NODE_ENV === 'production') {
  throw new Error('ALLOW_DEV_AUTH 는 프로덕션에서 켤 수 없습니다.');
}
/** 구글 OAuth 웹 클라이언트 ID — 없으면 `/auth/google` 라우트가 비활성화된다(`server.ts`). */
const googleClientId = process.env.GOOGLE_CLIENT_ID;

function storageDeps(): Pick<ServerDeps, 'wallet' | 'save' | 'leagueTier' | 'identity'> {
  const socketPath = process.env.DB_SOCKET_PATH;
  if (!socketPath) return memoryDeps(secret); // 로컬 개발 전용 — 소켓 경로 없으면 인메모리.

  const pool = new Pool({
    host: socketPath,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    max: 5, // Cloud Run 인스턴스당 커넥션 상한 — db-f1-micro 는 최대 커넥션 자체가 적다.
  });
  const db = createDb(pool);
  return {
    wallet: createPgWalletRepo(db),
    save: createPgSaveRepo(db),
    leagueTier: createPgLeagueTierRepo(db),
    identity: createPgIdentityRepo(db),
  };
}

const app = buildServer({ ...storageDeps(), secret, allowDevAuth, googleClientId, logger: true });
const port = Number(process.env.PORT ?? 8787);

app
  .listen({ port, host: '0.0.0.0' })
  .then((addr) => app.log.info(`PlayPOP api up at ${addr} (devAuth=${allowDevAuth})`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
