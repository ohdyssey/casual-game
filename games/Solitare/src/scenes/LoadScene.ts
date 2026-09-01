/**
 * LoadScene — 게임 로딩 화면(스플래시) **재교체 v2**(PO 2026-07-18).
 *
 * 신규 3종 에셋(SolitareHeights_03=배경키아트·Logo=로고 단독 레이어·02-1=BUILD NOW! 버튼)으로 재구성.
 *   로고는 배경에서 분리돼 독립 레이어로 **둥둥 부양**(bob) 애니메이션. 버튼은 본편 에셋 로딩이 다 끝나기
 *   전까지는 비활성(흐리게·터치 불가)이고, **로딩 완료 후에만 눌러야 게임(home)에 진입**한다(자동 전환 금지).
 *   ⚠️ 하늘색 노출 방지: 캔버스/초기배경/페이드 색이 모두 어두움(game.ts backgroundColor 도 어둡게 통일).
 */
import Phaser from 'phaser';
import { ensure as ensureAssetGroup } from '../ui/assetBudget.js';
import { loadGameAssets, loadAssetsWithRetry, preloadKoreanFonts } from '../assets.js';
import { preloadHomeAssets } from './HomeScene.js';
import { loadSave } from '../save.js';
import { SAFE_H as H, SAFE_W as W } from '../logic/responsiveFrame.js';
import { centerSafeZone } from '../ui/safeZone.js';
import { installDiagOverlay, viewBounds } from '@casual/core';

// 저작(=세이프존) 프레임 — 좌표 계약의 단일 출처는 logic/responsiveFrame.ts 다.
//   ⚠️ 이 값은 **캔버스 크기가 아니라 저작 크기**다. 캔버스는 앞으로 가변이 될 수 있으므로
//      화면 전체를 덮는 요소(딤 등)는 W/H 가 아니라 scene.scale.width/height 를 써야 한다.
const MIN_MS = 900; // 캐시로 즉시 로드돼도 최소 이 시간은 스플래시를 보여준다.
const FADE_MS = 300;
const BG_DARK = '#141019'; // 배경 아트 도착 전 찰나(하늘색 대신 어두운 색).

export class LoadScene extends Phaser.Scene {
  private btn?: Phaser.GameObjects.Image;
  private ready = false;

  constructor() {
    super('load');
  }

  preload(): void {
    centerSafeZone(this); // 세이프존을 화면 가운데로 — 로고·버튼·진행바가 저작 좌표 그대로 정렬된다.
    installDiagOverlay(this); // ?diag=1 일 때만 — 실기기 수치 확인용(화면 하단에 표시).
    this.cameras.main.setBackgroundColor(BG_DARK); // 하늘색 금지 — 어두운 색으로 시작.

    // **① 로딩 아트만 먼저 로드**(경량 WebP) — 본편 에셋 큐와 분리해 즉시 깔아 빈 화면/하늘색 노출 제거.
    this.load.image('load3_bg', 'loading/load3_bg.webp'); // 배경 키아트(캐릭터·타워·카피).
    this.load.image('load3_logo', 'loading/load3_logo.webp'); // 로고(단독 레이어, 부양 애니메이션용).
    this.load.image('load3_btn', 'loading/load3_btn.webp'); // 'BUILD NOW!' 버튼.

    // 배경(키아트) — **캔버스**를 꽉 채움(cover). 저작 크기(W/H)가 아니라 실제 캔버스를 기준으로
    //   덮어야 폭/높이가 늘어난 기기에서 가장자리가 비지 않는다(고정 캔버스에서는 종전과 동일).
    this.load.once('filecomplete-image-load3_bg', () => {
      const bg = this.add.image(W / 2, H / 2, 'load3_bg').setDepth(-2);
      // 위치는 저작 중심(카메라가 세이프존을 화면 가운데 놓는다), 배율만 **캔버스**를 덮도록.
      const v = viewBounds(this); // 캔버스가 아니라 **보이는 영역**(줌 반영)을 덮어야 한다.
      bg.setScale(Math.max(v.w / bg.width, v.h / bg.height));
    });
    // 로고 — 상단 하늘 영역(배경 카피 문구 위쪽), **둥둥 부양**(계속 반복).
    this.load.once('filecomplete-image-load3_logo', () => {
      const logo = this.add.image(W / 2, 430, 'load3_logo').setDepth(2);
      logo.setScale((W * 0.6 * 1.3) / logo.width); // 1.3배 확대(PO 지시).
      const y0 = logo.y;
      this.tweens.add({ targets: logo, y: y0 - 26, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
    // 'BUILD NOW!' 버튼 — 하단, **로딩 완료 전까지는 흐리게·비활성**(loadingDone 에서 활성화).
    this.load.once('filecomplete-image-load3_btn', () => {
      const btn = this.add.image(W / 2, H - 360, 'load3_btn').setDepth(3).setAlpha(0.4);
      btn.setScale(Math.min(1, (W * 0.62) / btn.width));
      this.btn = btn;
    });
  }

  create(): void {
    // 이 시점 = 로딩 아트(preload 큐) 완료 → 아트가 이미 깔림(하늘색/빈화면 안 보임).
    // **진행바 + 본편 에셋(무거움)을 2차로 로드**한다(진행바가 이 매니페스트 로드를 추종).
    const bw = 560;
    const bh = 22;
    const bx = (W - bw) / 2;
    const by = H - 210;
    const barBg = this.add.graphics().setDepth(10).fillStyle(0x0e0a16, 0.45).fillRoundedRect(bx - 6, by - 6, bw + 12, bh + 12, 16);
    const bar = this.add.graphics().setDepth(11);
    const pct = this.add
      .text(W / 2, by + bh + 40, '0%', { fontFamily: '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif', fontSize: '32px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(11)
      .setShadow(0, 2, '#00000088', 4);
    this.load.on('progress', (p: number) => {
      bar.clear().fillStyle(0xffd166, 1).fillRoundedRect(bx, by, Math.max(bh, bw * p), bh, 11);
      pct.setText(`${Math.round(p * 100)}%`);
    });

    // 한글 폰트 선로딩 + 본편 에셋 로드 완료 + 최소표시시간이 지나면 **바로 진입**한다.
    //   (PO 2026-08-21: "빌드나우 버튼을 누르지 않아도 로딩이 끝나면 게임으로 진입하게 할 것".
    //    예전에는 버튼 탭을 기다렸다 — 이제 버튼은 진입 연출의 일부이자 조기 탭 수단으로만 남는다.)
    let went = false;
    const toHome = (): void => {
      if (went) return;
      went = true;
      this.scene.start('home', { fromLoad: true }); // 홈이 검정에서 페이드인(하늘색 잔여 방지).
    };
    const beginFade = (): void => {
      if (went) return;
      this.cameras.main.fadeOut(FADE_MS, 10, 8, 16); // 검정(하늘색 아님).
      this.cameras.main.once('camerafadeoutcomplete', toHome);
      this.time.delayedCall(FADE_MS + 150, toHome); // 페이드 콜백 누락 대비.
    };
    const markReady = (): void => {
      if (this.ready) return;
      this.ready = true;
      // 진행바 숨김 + 버튼 활성화(밝게 + 터치 가능 + 부양·펄스로 "눌러주세요" 유도).
      barBg.setVisible(false);
      bar.setVisible(false);
      pct.setVisible(false);
      const btn = this.btn;
      if (btn) {
        // 버튼은 **밝아지기만** 한다 — 곧바로 페이드가 시작되므로 부양·펄스 반복 연출은 넣지 않는다
        //   (진입 중에 "눌러주세요" 유도를 하면 오해를 준다). 탭도 계속 받는다(같은 beginFade, 중복 가드 있음).
        btn.setInteractive({ useHandCursor: true });
        btn.on('pointerdown', beginFade);
        this.tweens.add({ targets: btn, alpha: 1, duration: 200, ease: 'Sine.easeOut' });
      }
      beginFade(); // **자동 진입** — 탭을 기다리지 않는다.
    };
    // 배포 직후 첫 로딩에서 일부 파일이 실패해도(콜드 CDN 엣지) 몇 초 내로 자동 재시도한다
    //   (assets.ts loadAssetsWithRetry — 반드시 load.start() 전에 걸어야 loaderror 를 놓치지 않는다).
    const assetsDone = loadAssetsWithRetry(this, { retries: 2, delayMs: 1200 });
    const minDelay = new Promise<void>((r) => this.time.delayedCall(MIN_MS, () => r()));
    this.time.delayedCall(16000, markReady); // 상한(부지 그룹까지 포함) — 16초 뒤엔 무조건 진입한다(로딩이 늦어도 멈추지 않게).

    // **② 본편 에셋 로드 시작**(매니페스트→업로드 이미지 + 레이아웃 json). 로딩 아트가 이미 화면에 있음.
    loadGameAssets(this);
    /*
     * **홈이 쓰는 아트도 여기서 같이 받는다**(2026-08-31) — 예전엔 HomeScene.preload() 안에만 있어서
     *   이 진행바가 100% 를 찍고 화면이 넘어간 **뒤에** 두 번째로(진행바 없이) 조용히 다시 로드됐다.
     *   콜렉션 카드가 63→135장으로 늘면서 이 보이지 않는 2차 로딩이 길어져 "로딩화면이 지나간 뒤
     *   2~3초 어두운 화면" 으로 체감됐다. 여기서 먼저 받아 두면 홈에 도착했을 땐 전부
     *   `textures.exists` 라 HomeScene.preload() 가 사실상 즉시 끝난다.
     */
    preloadHomeAssets(this);
    this.load.start();
    /*
     * **홈 진입 즉시 보여야 하는 부지 그룹도 기다린다**(2026-08-31 2차 — 노트8 실측 "첫 진입 땐 안 뜨고
     *   프리셀 갔다 오면 뜬다"). 부지 그룹(office·bank·lot2·lot3)은 `ui/assetBudget` 의 **별도 로더**라 그동안
     *   `prefetchGroup` 로 fire-and-forget 만 했다 — dev/로컬은 그룹 로드가 ~85ms 라 체감이 안 됐지만, 실기기
     *   네트워크에서는 초 단위로 걸려 홈에 먼저 도착해 버렸다(그 사이 HomeScene 의 `ensureAssetGroup` 이 각자
     *   다시 받는 동안 건물이 비어 있었다 — 프리셀을 한 판 하고 오면 그새 다 받아져 있었을 뿐이다).
     *   여기서 **저장된 상태가 실제로 필요로 하는 그룹만** 골라 로딩바가 그것들도 다 받을 때까지 기다린다.
     *   ⚠️ **위 메인 큐(`this.load.start()`) 뒤에** 불러야 한다 — `ensure()` 가 로더를 직접 건드리는데(내부
     *   `loadKeys`), 메인 큐가 아직 시작 전이면 여기서 먼저 `load.start()` 를 불러 버려 뒤이어 메인 큐가
     *   등록한 나머지 파일들이 씹힌다(실측: 순서를 반대로 했다가 로더 경합으로 되돌림).
     */
    const saved = loadSave();
    const neededGroups: Array<'office' | 'bank' | 'lot2' | 'lot3'> = ['office']; // 오피스 타워는 항상 프리빌트(상시 표시).
    if ((saved.compBankFloors ?? 0) > 0) neededGroups.push('bank');
    if (saved.showAllLot2 || (saved.lot2Built && (saved.lot2Floors ?? 0) >= 1)) neededGroups.push('lot2');
    if (saved.hotelBuilt && (saved.hotelFloors ?? 0) >= 1) neededGroups.push('lot3');
    const lotGroupsDone = Promise.all(neededGroups.map((g) => ensureAssetGroup(this, g).catch(() => undefined)));
    void Promise.all([preloadKoreanFonts().catch(() => undefined), assetsDone, minDelay, lotGroupsDone]).then(markReady);
  }
}
