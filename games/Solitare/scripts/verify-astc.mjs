/**
 * verify-astc.mjs — 배포 조립본(정적 서빙)에서 **ASTC(KTX) 텍스처가 실제로 받아지는지** 확인한다.
 *   프로덕션 번들에는 게임 핸들(__PHASER_GAME__)이 없으므로 **네트워크 요청**으로 본다: `.ktx` 수신 수, 같은 키의 `.webp`
 *   중복 수신(=폴백이 같이 탄 것) 0, 4xx/5xx·페이지 오류 0, 스크린샷. 헤드리스 SwiftShader 가 ASTC 확장을 지원한다(2026-08-31).
 *   사용: (별도 셸) cd d:/tmp/rl-deploy && python -m http.server 6299   →   node scripts/verify-astc.mjs [out.png]
 */
import { chromium } from 'playwright';
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 540, height: 1200 } });
await page.addInitScript(() => { try { localStorage.setItem('rl_site_gate_v1', '5f395d07369071a505ef926527de2ac53e8c29e103dc63398315bc276224b81a'); Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined }); localStorage.setItem('solitaire_tips_v1', JSON.stringify(['bonusIntro', 'klondikeRules'])); } catch {} });
const errs = []; const ktx = new Set(); const webp = new Set(); let bad = 0;
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
page.on('response', (r) => { const u = r.url(); if (r.status() >= 400 && !/audio\//.test(u)) { bad++; errs.push('HTTP' + r.status() + ' ' + u.slice(-70)); } if (u.endsWith('.ktx')) ktx.add(u.split('/').pop().replace('.ktx', '')); if (u.endsWith('.webp')) webp.add(u.split('/').pop().replace('.webp', '')); });
await page.goto('http://localhost:6299/solitaire/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(30000);
const dup = [...ktx].filter((k) => webp.has(k));
const r = { ktxLoaded: ktx.size, webpLoaded: webp.size, duplicates: dup.length, http4xx5xx: bad, errors: errs.slice(0, 5), sample: [...ktx].slice(0, 3) };
console.log(JSON.stringify(r));
await page.screenshot({ path: process.argv[2] || 'astc-verify.png' }); await b.close();
if (ktx.size === 0 || dup.length || bad || errs.length) process.exit(1);
