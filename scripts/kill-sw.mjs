/**
 * kill-sw — 게임용 vite 플러그인: 게임은 허브에서 실행되는 콘텐츠이므로 자체 PWA/정밀캐시
 * 서비스워커를 두지 않는다(배포가 즉시 반영되고, SW 새로고침으로 인한 더블 로딩이 없음).
 *
 *  · 빌드: dist/sw.js 를 '클리너' SW 로 emit. 기존에 등록된 SW(이전 배포의 정밀캐시/자가소멸 SW)는
 *    브라우저의 업데이트 체크 시 이 클리너로 교체되어 → 모든 캐시 삭제 + 자기 해제한다.
 *    ⚠️ **새로고침(client.navigate) 하지 않는다** → 더블 로딩 루프 제거.
 *  · registerSW 를 주입하지 않는다 → 새 방문자는 SW 를 아예 등록하지 않음(항상 네트워크 최신).
 *  · dev(serve): /sw.js 요청에도 동일 클리너 응답(좀비 SW 제거), /registerSW.js 는 빈 응답.
 */
const CLEANER_SW = `// one-shot cleaner: clears caches + reloads ONCE (heals stale PWA) + self-unregisters.
//   기존 캐싱 SW 를 교체할 때만 1회 새로고침(?swc=1 플래그 가드 + self-unregister 로 더블로딩 루프 없음).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {}
    try {
      await self.clients.claim();
      const cls = await self.clients.matchAll({ type: 'window' });
      for (const c of cls) {
        const u = new URL(c.url);
        if (u.searchParams.get('swc') === '1') continue; // 이미 정리됨 → 루프 방지.
        u.searchParams.set('swc', '1');
        try { await c.navigate(u.href); } catch (e) {}
      }
    } catch (e) {}
    try { await self.registration.unregister(); } catch (e) {}
  })());
});
`;

export function killSW() {
  return {
    name: 'kill-sw',
    // dev: 좀비 SW 자동 제거(이전 PWA dev SW 포함). registerSW 는 비움.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (url === '/sw.js') {
          res.setHeader('Content-Type', 'application/javascript');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.end(CLEANER_SW);
          return;
        }
        if (url === '/registerSW.js') {
          res.setHeader('Content-Type', 'application/javascript');
          res.end('');
          return;
        }
        next();
      });
    },
    // build: 클리너 SW 를 dist/sw.js 로 출력(기존 SW 정리용). registerSW/manifest 는 만들지 않음.
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: CLEANER_SW });
    },
  };
}
