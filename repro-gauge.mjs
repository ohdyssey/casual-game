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
const r = await page.evaluate(() => {
  const p=window.__game.scene.getScene('play');
  const gv=p.gaugeView; const n=gv?.nodes||{};
  // find layer_18 + layer_16_copy2 by id in scene
  let l18=null, l16c2=null;
  const walk=(o)=>{ if(o.type==='Text'){ /* can't read id easily; use text+color */ } o.list?.forEach?.(walk); };
  return {
    timerText: { text: n.timerText?.text, color: n.timerText?.style?.color },     // should be M:SS, yellow base
    currentText: n.currentText?.text,   // current progress (no slash)
    targetText: n.targetText?.text,     // target
    finalText: n.finalText?.text,       // reward amount
    finalBadgeKey: n.finalBadge?.texture?.key,
    hasMilestoneText: !!n.milestoneText,
    hasMilestoneBadge: !!n.milestoneBadge,
  };
});
console.log('GAUGE', JSON.stringify(r));
// verify old layer_18 hidden + set a timer value to confirm timerText updates
const t = await page.evaluate(() => {
  const p=window.__game.scene.getScene('play');
  p.gaugeView.setTimer(119000); // 1:59
  // find layer_18 node via the scene display list (text '1:00:00' or hidden)
  let l18vis=null;
  const walk=(o)=>{ if(o.type==='Text' && o.text==='1:00:00') l18vis=o.visible; o.list?.forEach?.(walk); };
  p.children.list.forEach(walk);
  return { timerAfterSet: p.gaugeView.nodes.timerText?.text, oldLayer18Visible: l18vis };
});
console.log('TIMER', JSON.stringify(t));
await browser.close();
