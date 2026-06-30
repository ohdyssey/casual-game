/** 서버 진입점 — 환경포트로 리슨. `npm run start`(tsx) 로 실행. */
import { buildServer } from './server.js';

const app = buildServer();
const port = Number(process.env.PORT ?? 8787);

app
  .listen({ port, host: '0.0.0.0' })
  .then((addr) => app.log.info(`PlayPOP api up at ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
