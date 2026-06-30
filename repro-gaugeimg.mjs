import { chromium } from 'playwright';
const base = 'http://localhost:6207/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 540, height: 1200 } });
const page = await ctx.newPage();
await page.addInitScript(() => { Object.defineProperty(document,'visibilityState',{get:()=>'visible',configurable:true}); Object.defineProperty(document,'hidden',{get:()=>false,configurable:true}); });
await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => { Object.keys(localStorage).filter(k=>k.startsWith('socialcasino')).forEach(k=>localStorage.removeItem(k)); });
await page.reload({ waitUntil: 'networkidle' });
await page.bringToFront();
await page.evaluate(() => { window.__wake = setInterval(()=>{ try{ window.__game?.loop?.wake(); }catch{} }, 80); });
for (let i=0;i<40;i++){ await page.waitForTimeout(400); const ok=await page.evaluate(()=>window.__game?.scene?.getScene('lobby')?.sys?.settings?.status===5 && !!window.__lobbyPlay); if(ok)break; }
let inPlay=false;
for (let a=0;a<8 && !inPlay;a++){ await page.evaluate(()=>{ const l=window.__game.scene.getScene('lobby'); if(l?.sys?.settings?.status===5&&window.__lobbyPlay) window.__lobbyPlay.emit('pointerdown'); }); for (let i=0;i<12;i++){ await page.waitForTimeout(400); inPlay=await page.evaluate(()=>window.__game.scene.getScene('play')?.sys?.settings?.status===5 && window.__game.scene.getScene('lobby')?.sys?.settings?.status!==5); if(inPlay)break; } }
// set some progress so the fill is visible
await page.evaluate(()=>{ const p=window.__game.scene.getScene('play'); p.gaugeState={progress:Math.round(p.gaugeCfg.target*0.5), startedAtMs:Date.now(), claimed:[]}; p.renderGauge(Date.now(), false); });
await page.waitForTimeout(600);
const geom = await page.evaluate(()=>{ const p=window.__game.scene.getScene('play'); const gv=p.gaugeView; const n=gv.nodes; const b=(o)=>o?{x:Math.round(o.x),y:Math.round(o.y),dw:Math.round(o.displayWidth),dh:Math.round(o.displayHeight)}:null; return { fillBar:b(n.fillBar), collectGem:b(n.collectGem), finalBadge:b(n.finalBadge), fillRange: Math.round(gv.fillRange), fillBottomY: Math.round(gv.fillBottomY) }; });
console.log('GEOM', JSON.stringify(geom));
await page.screenshot({ path: 'C:/Users/user/AppData/Local/Temp/claude/d--Dev-CasualGame-games-SocialCasino/ae77f16d-11c5-4bba-8b01-fea35874bd20/scratchpad/gauge.png', clip: {x:0,y:0,width:170,height:560} });
await browser.close();
