/**
 * LoadScene — 게임 로딩 화면(스플래시).
 *
 * 디자이너 제공 로딩 아트(loading/splash_bg.png = 타워 일러스트 · splash_logo.png = 타이틀 로고)를 깔고,
 * 그 위에 실제 에셋 로더 진행률을 따르는 진행바를 그린다. 본편 에셋(매니페스트·레이아웃)을 여기서 일괄
 * 적재하므로 이후 홈 전환이 즉각적이다. 완료(+한글폰트 선로딩+최소표시시간) 후 페이드로 home 으로 넘어간다.
 */
import Phaser from 'phaser';
import { loadGameAssets, preloadKoreanFonts } from '../assets.js';

const W = 1080;
const H = 2400;
const MIN_MS = 700; // 캐시로 즉시 로드돼도 최소 이 시간은 스플래시를 보여준다.
const FADE_MS = 260;

export class LoadScene extends Phaser.Scene {
  constructor() {
    super('load');
  }

  preload(): void {
    this.cameras.main.setBackgroundColor('#8ecbf0'); // 하늘색(레터박스/로드 초기 찰나).

    // **① 스플래시 아트만 먼저 로드**(경량 WebP) — 본편 에셋 큐와 분리해 **즉시** 깔아 하늘색 노출 제거.
    //   ②splash는 WebP로 1.86MB→0.18MB(10배↓)라 첫 로드에서도 거의 즉시 도착.
    this.load.image('splash_bg', 'loading/splash_bg.webp');
    this.load.image('splash_logo', 'loading/splash_logo.webp');
    this.load.once('filecomplete-image-splash_bg', () => {
      const img = this.add.image(W / 2, H / 2, 'splash_bg').setDepth(-2);
      img.setScale(Math.max(W / img.width, H / img.height)); // 프레임 꽉 채움(cover).
    });
    this.load.once('filecomplete-image-splash_logo', () => {
      const logo = this.add.image(W / 2, 300, 'splash_logo').setDepth(2);
      logo.setScale(Math.min(0.95, (W * 0.7) / logo.width));
    });
  }

  create(): void {
    // 이 시점 = 스플래시(preload 큐) 로드 완료 → 스플래시 아트가 이미 깔림(하늘색 안 보임).
    // **진행바 + 본편 에셋(무거움)을 2차로 로드**한다(진행바가 이 매니페스트 로드를 추종).
    const bw = 620;
    const bh = 30;
    const bx = (W - bw) / 2;
    const by = H - 300;
    this.add.graphics().setDepth(10).fillStyle(0x1a1030, 0.32).fillRoundedRect(bx - 6, by - 6, bw + 12, bh + 12, 20);
    const bar = this.add.graphics().setDepth(11);
    const pct = this.add
      .text(W / 2, by + bh + 42, '0%', { fontFamily: '"Jua", sans-serif', fontSize: '34px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(11)
      .setShadow(0, 2, '#00000066', 4);
    this.load.on('progress', (p: number) => {
      bar.clear().fillStyle(0xffd166, 1).fillRoundedRect(bx, by, Math.max(bh, bw * p), bh, 15);
      pct.setText(`${Math.round(p * 100)}%`);
    });

    // 한글 폰트 선로딩 + 본편 에셋 로드 완료 + 최소표시시간 후 페이드 → home.
    //   **어떤 경우에도 로딩에 갇히지 않게** 상한 타이머 병행.
    let went = false;
    const toHome = (): void => {
      if (went) return;
      went = true;
      this.scene.start('home');
    };
    const beginFade = (): void => {
      if (went) return;
      this.cameras.main.fadeOut(FADE_MS, 142, 203, 240);
      this.cameras.main.once('camerafadeoutcomplete', toHome);
      this.time.delayedCall(FADE_MS + 150, toHome); // 페이드 콜백 누락 대비.
    };
    const assetsDone = new Promise<void>((r) => this.load.once('complete', () => r()));
    const minDelay = new Promise<void>((r) => this.time.delayedCall(MIN_MS, () => r()));
    void Promise.all([preloadKoreanFonts().catch(() => undefined), assetsDone, minDelay]).then(beginFade);
    this.time.delayedCall(8000, beginFade); // 상한(에셋 많음) — 8초 뒤엔 무조건 진행.

    // **② 본편 에셋 로드 시작**(매니페스트→업로드 이미지 + 레이아웃 json). 스플래시가 이미 화면에 있으므로 하늘색 미노출.
    loadGameAssets(this);
    this.load.start();
  }
}
