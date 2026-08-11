/**
 * LoadScene — 게임 로딩 화면(스플래시) **재교체 v2**(PO 2026-07-18).
 *
 * 신규 3종 에셋(SolitareHeights_03=배경키아트·Logo=로고 단독 레이어·02-1=BUILD NOW! 버튼)으로 재구성.
 *   로고는 배경에서 분리돼 독립 레이어로 **둥둥 부양**(bob) 애니메이션. 버튼은 본편 에셋 로딩이 다 끝나기
 *   전까지는 비활성(흐리게·터치 불가)이고, **로딩 완료 후에만 눌러야 게임(home)에 진입**한다(자동 전환 금지).
 *   ⚠️ 하늘색 노출 방지: 캔버스/초기배경/페이드 색이 모두 어두움(game.ts backgroundColor 도 어둡게 통일).
 */
import Phaser from 'phaser';
import { loadGameAssets, preloadKoreanFonts } from '../assets.js';

const W = 1080;
const H = 2400;
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
    this.cameras.main.setBackgroundColor(BG_DARK); // 하늘색 금지 — 어두운 색으로 시작.

    // **① 로딩 아트만 먼저 로드**(경량 WebP) — 본편 에셋 큐와 분리해 즉시 깔아 빈 화면/하늘색 노출 제거.
    this.load.image('load3_bg', 'loading/load3_bg.webp'); // 배경 키아트(캐릭터·타워·카피).
    this.load.image('load3_logo', 'loading/load3_logo.webp'); // 로고(단독 레이어, 부양 애니메이션용).
    this.load.image('load3_btn', 'loading/load3_btn.webp'); // 'BUILD NOW!' 버튼.

    // 배경(키아트) — 프레임 꽉 채움(cover).
    this.load.once('filecomplete-image-load3_bg', () => {
      const bg = this.add.image(W / 2, H / 2, 'load3_bg').setDepth(-2);
      bg.setScale(Math.max(W / bg.width, H / bg.height));
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
      .text(W / 2, by + bh + 40, '0%', { fontFamily: '"Jua", sans-serif', fontSize: '32px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(11)
      .setShadow(0, 2, '#00000088', 4);
    this.load.on('progress', (p: number) => {
      bar.clear().fillStyle(0xffd166, 1).fillRoundedRect(bx, by, Math.max(bh, bw * p), bh, 11);
      pct.setText(`${Math.round(p * 100)}%`);
    });

    // 한글 폰트 선로딩 + 본편 에셋 로드 완료 + 최소표시시간 후 **버튼을 활성화**만 한다(자동 진입 금지).
    //   실제 home 진입은 **유저가 버튼을 눌러야만** 일어난다(beginFade/toHome).
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
      if (!btn) {
        beginFade(); // 버튼 아트가 아직 안 왔으면(극단적 지연) 자동 진행으로 폴백.
        return;
      }
      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerdown', beginFade);
      this.tweens.add({ targets: btn, alpha: 1, duration: 260, ease: 'Sine.easeOut' });
      const y0 = btn.y;
      const s0 = btn.scaleX;
      this.tweens.add({ targets: btn, y: y0 - 16, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: btn, scaleX: s0 * 1.06, scaleY: s0 * 1.06, duration: 780, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    };
    const assetsDone = new Promise<void>((r) => this.load.once('complete', () => r()));
    const minDelay = new Promise<void>((r) => this.time.delayedCall(MIN_MS, () => r()));
    void Promise.all([preloadKoreanFonts().catch(() => undefined), assetsDone, minDelay]).then(markReady);
    this.time.delayedCall(9000, markReady); // 상한(에셋 많음) — 9초 뒤엔 무조건 버튼을 활성화(그래도 진입은 탭 대기).

    // **② 본편 에셋 로드 시작**(매니페스트→업로드 이미지 + 레이아웃 json). 로딩 아트가 이미 화면에 있음.
    loadGameAssets(this);
    this.load.start();
  }
}
