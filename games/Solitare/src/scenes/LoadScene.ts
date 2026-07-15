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
    this.cameras.main.setBackgroundColor('#8ecbf0'); // 하늘색(레터박스/로드 초기).

    // 진행바(그래픽 — 에셋 없이 즉시 표시).
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

    // 스플래시 배경/로고 — 먼저 큐잉하고 로드되는 즉시 표시(뒤에 깔림).
    this.load.image('splash_bg', 'loading/splash_bg.png');
    this.load.image('splash_logo', 'loading/splash_logo.png');
    this.load.once('filecomplete-image-splash_bg', () => {
      const img = this.add.image(W / 2, H / 2, 'splash_bg').setDepth(-2);
      img.setScale(Math.max(W / img.width, H / img.height)); // 프레임 꽉 채움(cover).
    });
    this.load.once('filecomplete-image-splash_logo', () => {
      const logo = this.add.image(W / 2, 300, 'splash_logo').setDepth(2);
      logo.setScale(Math.min(0.95, (W * 0.7) / logo.width));
    });

    // 본편 에셋(매니페스트→업로드 이미지 + 레이아웃 json) — 진행바가 추종.
    loadGameAssets(this);
  }

  create(): void {
    // 한글 폰트 선로딩 + 최소 표시시간 후 페이드 → home. **어떤 경우에도 로딩에 갇히지 않게** 가드/상한 타이머 병행
    //   (preloadKoreanFonts 가 폰트 로드에서 멈추면 Promise 가 안 끝나므로 안전 타이머로 강제 진행).
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
    const minDelay = new Promise<void>((r) => this.time.delayedCall(MIN_MS, () => r()));
    void Promise.all([preloadKoreanFonts().catch(() => undefined), minDelay]).then(beginFade);
    this.time.delayedCall(3000, beginFade); // 폰트 지연/행 상한 — 3초 뒤엔 무조건 진행.
  }
}
