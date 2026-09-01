/**
 * starterOffer(씬 팝업) — **초회 한정 스타터 팩** 오퍼(PO 2026-08-25).
 *
 * 노출 지점: **코인이 부족한 그 순간**(플레이 ＋5/되돌리기 spend 실패 · 홈 입장료 부족) —
 * 실측 최빈 소비 접점이라 전환율이 가장 높은 자리다. 초회 한정(starterPackBought)이며,
 * 이미 샀으면 이 모듈은 열리지 않는다(호출부가 starterOfferAvailable 로 거른다).
 *
 * ⚠️ 홈에서 열 때는 반드시 `uiCam` 을 넘길 것(CLAUDE.md 공용 팝업 규칙) — 안 넘기면 월드
 *   카메라 팬/줌 때문에 딤이 어긋나 가장자리가 뚫린다. 플레이 화면은 생략 가능.
 * ⚠️ 구매는 목업(logic/starterOffer.buyStarterPack) — 실결제 연동 전까지 즉시 지급.
 */
import Phaser from 'phaser';
import { loadSave, writeSave } from '../save.js';
import { buyStarterPack, STARTER_PACK, starterOfferAvailable } from '../logic/starterOffer.js';
import { collectionArtKey } from './collectionPopup.js';
import { overlayScrim } from '../ui/overlay.js';
import { SAFE_H as H, SAFE_W as W } from '../logic/responsiveFrame.js';
import { sfx } from '../audio.js';
import { bumpMetrics } from '../logic/dailyMetrics.js';

export interface StarterOfferOpts {
  /** 홈처럼 UI 전용 카메라를 쓰는 씬은 반드시 넘길 것 — 딤/입력이 그 카메라 기준으로 계산된다. */
  readonly uiCam?: Phaser.Cameras.Scene2D.Camera;
  /** 팝업에 뜨는 새 오브젝트를 UI 카메라에 등록해야 하는 씬(홈)의 훅. */
  readonly pinToUi?: (o: Phaser.GameObjects.GameObject) => void;
  /** 구매(목업 지급) 완료 — 호출부가 헤더 코인/부스터 라벨을 갱신한다. */
  readonly onGranted?: (granted: { coins: number; plus5: number; wild: number; card: { set: number; card: number } | null }) => void;
  readonly toast?: (msg: string) => void;
}

const DEPTH = 7600; // 다른 팝업(딤 7000대)보다 위 — 핀치 순간의 최상위 제안.

/** 스타터 팩 팝업을 연다. 이미 구매했으면 아무것도 하지 않고 false. */
export function openStarterOffer(scene: Phaser.Scene, opts: StarterOfferOpts = {}): boolean {
  if (!starterOfferAvailable(loadSave())) return false;
  const objs: Phaser.GameObjects.GameObject[] = [];
  const pin = (o: Phaser.GameObjects.GameObject): void => {
    objs.push(o);
    opts.pinToUi?.(o);
  };

  // 전체 화면 딤 + 입력 차단(캔버스 가변폭 대응 — overlayScrim 이 카메라 기준으로 계산).
  const scrim = overlayScrim(scene, 0x000000, 0.62, opts.uiCam).setDepth(DEPTH);
  scrim.setInteractive(); // 뒤 클릭 차단.
  pin(scrim);

  const cx = W / 2;
  const cy = H * 0.44;
  const PW = 820;
  const PH = 960;
  const g = scene.add.graphics().setDepth(DEPTH + 1);
  g.fillStyle(0xfff4e2, 1).fillRoundedRect(cx - PW / 2, cy - PH / 2, PW, PH, 34);
  g.lineStyle(8, 0x3f8fde, 1).strokeRoundedRect(cx - PW / 2, cy - PH / 2, PW, PH, 34);
  g.fillStyle(0x3f8fde, 1).fillRoundedRect(cx - PW / 2, cy - PH / 2, PW, 118, { tl: 34, tr: 34, bl: 0, br: 0 });
  pin(g);

  const FONT = '"Baloo 2", "Pretendard Variable", "M PLUS Rounded 1c", system-ui, sans-serif';
  const t = (x: number, y: number, msg: string, size: number, color: string, style = '700'): Phaser.GameObjects.Text => {
    const o = scene.add.text(x, y, msg, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: style, align: 'center' }).setOrigin(0.5).setDepth(DEPTH + 2);
    pin(o);
    return o;
  };
  t(cx, cy - PH / 2 + 59, '🎁 스타터 팩 · 초회 한정', 44, '#ffffff');
  t(cx, cy - PH / 2 + 180, '지금 딱 한 번만 드리는 구성!', 34, '#c9541f');

  // 구성 목록 — STARTER_PACK 단일 출처.
  const rows: Array<[string, string]> = [
    ['🪙', `코인 ${STARTER_PACK.coins.toLocaleString()}`],
    ['🂠', `＋5 카드 ×${STARTER_PACK.plus5}`],
    ['🃏', `와일드 ×${STARTER_PACK.wild}`],
    ['🗂', `컬렉션 카드 ${STARTER_PACK.collectionCards}장 확정!`],
  ];
  rows.forEach(([icon, label], i) => {
    const y = cy - PH / 2 + 280 + i * 96;
    t(cx - 250, y, icon, 44, '#5a3210');
    const o = scene.add.text(cx - 190, y, label, { fontFamily: FONT, fontSize: '38px', color: '#5a3210', fontStyle: '700' }).setOrigin(0, 0.5).setDepth(DEPTH + 2);
    pin(o);
  });
  // 가성비 앵커 — 판당 소비 기준(실측 ~4,000/판) 체감 문구. 확률 수치는 표기하지 않는다(고지 정책 확정 전).
  t(cx, cy - PH / 2 + 680, '판당 코인 소비 기준 열 판 분량 이상!', 28, '#8a6a3a', '500');

  // 구매(목업) 버튼.
  const buyW = 560;
  const buyH = 108;
  const buyY = cy + PH / 2 - 190;
  const bg = scene.add.graphics().setDepth(DEPTH + 1);
  bg.fillStyle(0x53b654, 1).fillRoundedRect(cx - buyW / 2, buyY - buyH / 2, buyW, buyH, 26);
  bg.lineStyle(5, 0x2c7c2f, 1).strokeRoundedRect(cx - buyW / 2, buyY - buyH / 2, buyW, buyH, 26);
  pin(bg);
  t(cx, buyY, `${STARTER_PACK.priceLabel} 로 받기`, 40, '#ffffff');

  const close = (): void => {
    for (const o of objs) o.destroy();
  };
  const buyZone = scene.add.zone(cx, buyY, buyW, buyH).setInteractive({ useHandCursor: true }).setDepth(DEPTH + 3);
  buyZone.on('pointerdown', () => {
    // ⚠️ 목업 결제 — 즉시 지급. 실결제 연동 시 이 블록을 결제 성공 콜백으로 이동.
    const save = loadSave();
    if (!starterOfferAvailable(save)) { close(); return; }
    const granted = buyStarterPack(save);
    writeSave(save);
    sfx('coin_burst', { volume: 0.4 });
    bumpMetrics({ iapCoins: STARTER_PACK.coins, iapCount: 1 }); // 일일 지표 — 결제(목업).
    const cardName = granted.card ? collectionArtKey(granted.card.set, granted.card.card) : '';
    void cardName; // 아트 연출은 호출부(onGranted) 몫 — 팝업은 닫고 끝낸다.
    opts.toast?.(`🎁 스타터 팩 지급! 🪙 +${STARTER_PACK.coins.toLocaleString()}`);
    opts.onGranted?.({ coins: STARTER_PACK.coins, plus5: STARTER_PACK.plus5, wild: STARTER_PACK.wild, card: granted.card });
    close();
  });
  pin(buyZone);

  // 닫기 — "나중에" 텍스트 버튼(강요하지 않는다 — 다음 핀치에 또 뜬다).
  const later = t(cx, cy + PH / 2 - 70, '나중에 받을게요', 30, '#9a8a72', '500');
  later.setInteractive({ useHandCursor: true });
  later.on('pointerdown', () => close());

  return true;
}
