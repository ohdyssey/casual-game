/** 헬스체크 — 배포 스모크와 CORS preflight 확인용. 인증 없음. */
import { getHandler } from '../src/http.js';

export default getHandler(async () => ({ ok: true, service: 'ttt-api' }));
