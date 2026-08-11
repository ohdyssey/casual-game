/**
 * entryPopup.ts — 홈/플레이 **공용 게임 진입 팝업**(레벨 엔트리 — 크라운·리본·별·보물상자·PLAY 버튼).
 *   에디터 저작 blank.json 을 SSOT 로 렌더한다(패널·별·보상·플레이 버튼 전부 아트).
 *
 * PO 2026-07-19: "게임비를 지급하는 팝업화면은 동일하므로 타워화면에서 게임비를 지급하는 팝업화면을
 *   재사용하라" — 예전엔 홈(HomeScene.startPlayFromLayout)과 플레이(PlayScene.enterNextLevel)가 **서로
 *   다른 화면**(홈=이 blank.json 렌더, 플레이=코드로 대충 그린 사각형 placeholder)을 썼다. 이제 하나의
 *   함수로 통합해 두 씬 모두 이 모듈을 호출한다(topHeader.ts·missionRewardBanner.ts 와 동일 패턴).
 */
import Phaser from 'phaser';
import { sfx } from '../audio.js';
import { loadSave, writeSave } from '../save.js';
import { entryFeeFor, challengeOptions } from '../econRuntime.js';
import { UI_ENTRY_KEY } from '../assets.js';
import { popupOrganicIn, popupOrganicOut } from './popupFx.js';

/** 진입 팝업(blank.json) 노드 — layoutLoader 의 LayoutNode 상위집합(텍스트 그림자 포함). 데일리미션 팝업도 재사용. */
export interface EntryNode {
  readonly id: string;
  readonly type: string;
  readonly key?: string;
  readonly x: number;
  readonly y: number;
  readonly w?: number;
  readonly h?: number;
  readonly visible?: boolean;
  readonly text?: string;
  readonly fontSize?: number;
  readonly fontFamily?: string;
  readonly color?: string;
  readonly stroke?: string;
  readonly strokeW?: number;
  readonly shadow?: boolean;
  readonly shadowColor?: string;
  readonly shadowX?: number;
  readonly shadowY?: number;
  readonly shadowBlur?: number;
  readonly depth?: number;
}
export interface EntryDoc {
  readonly frame: { designW: number; designH: number };
  readonly nodes: ReadonlyArray<EntryNode>;
}

export interface EntryPopupOpts {
  readonly level: number;
  /** 직전 도전 배수 유지(해금 범위 밖이면 자동으로 가장 가까운 해금값) — 기본 1(홈에서 새로 여는 경우). */
  readonly initialMult?: number;
  readonly depth?: number; // 기본 4000.
  /** HomeScene 처럼 스크롤 월드 카메라와 고정 UI 카메라가 분리된 씬은 팝업을 UI 카메라 전용으로 고정. */
  readonly pinToUi?: (o: Phaser.GameObjects.GameObject) => void;
  readonly toast: (msg: string) => void;
  /** 결제 성공 직후(저장 완료) 헤더 등 코인 표시 갱신 — 선택. */
  readonly onCoinsChanged?: (coins: number) => void;
  /** ✕(취소) — 팝업은 이미 닫힌 뒤 호출된다. 기본 없음. ⚠️ 딤 배경 탭으로는 닫히지 않는다(아래 주석). */
  readonly onClose?: () => void;
  /**
   * **🏠 홈으로**(PO 2026-07-29 "이 씬에서 하단에 홈 버튼을 추가") — 넘기면 패널 아래에 홈 버튼을 그린다.
   *   팝업은 이미 닫힌 뒤 호출된다. 홈에서 여는 경우처럼 갈 곳이 없으면 생략.
   */
  readonly onHome?: () => void;
  /** 결제 성공 직후(팝업은 이미 닫힌 뒤) — 보통 여기서 scene.start('play', {level, mult}). */
  readonly onPlay: (next: { level: number; mult: number }) => void;
}

export interface EntryPopupHandle {
  readonly layer: Phaser.GameObjects.Container;
  close(): void;
}

/** blank.json 이 로드돼 있으면 팝업을 그리고 핸들을 반환, 없으면 null(호출부가 폴백 처리). */
export function buildEntryPopup(scene: Phaser.Scene, opts: EntryPopupOpts): EntryPopupHandle | null {
  const doc = (scene.cache.json.get(UI_ENTRY_KEY) ?? null) as EntryDoc | null;
  if (!doc || !Array.isArray(doc.nodes) || doc.nodes.length === 0) return null;

  const level = opts.level;
  const depth = opts.depth ?? 4000;
  const W = scene.scale.width;
  const H = scene.scale.height;
  const scale = W / doc.frame.designW; // 720 → 1080 = 1.5.
  const layer = scene.add.container(0, 0).setDepth(depth);
  opts.pinToUi?.(layer);

  // 딤 배경 — 탭하면 취소(입력 하부 차단 겸용).
  const scrim = scene.add.rectangle(0, 0, W, H, 0x140a1e, 0.86).setOrigin(0, 0).setInteractive();
  layer.add(scrim);
  // **유기체(젤리) 연출용 프레임**(popupFx) — 중심(W/2,H/2) 기준으로 스케일해야 화면 가운데서 안착.
  //   inner 는 저작 절대좌표(n.x*scale)를 그대로 쓰기 위한 역오프셋(−W/2,−H/2).
  const frame = scene.add.container(W / 2, H / 2);
  layer.add(frame);
  const inner = scene.add.container(-W / 2, -H / 2);
  frame.add(inner);

  let closing = false; // 닫힘 애니 중 재클릭/중복 결제 가드.
  const close = (): void => {
    if (closing) return;
    closing = true;
    sfx('level_close');
    popupOrganicOut(scene, scrim, frame, () => layer.destroy());
  };
  const cancel = (): void => {
    if (closing) return; // onClose 중복 호출 방지(✕ 연타).
    close();
    opts.onClose?.();
  };
  // ⚠️ **딤 배경 탭으로는 닫히지 않는다**(PO 2026-07-29 "플레이·닫기·홈 외에 다른 곳을 클릭해 취소되는
  //    경우를 없애라") — 게임비를 결제하는 화면이라 오터치로 닫히면 흐름이 끊긴다. scrim 은 하부 입력을
  //    막는 역할만 한다(setInteractive 만 하고 핸들러 없음).
  scrim.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
    ev?.stopPropagation?.();
  });

  // 노드 렌더(이미지/텍스트) — id 로 조회해 이후 동적 배선.
  const byId = new Map<string, Phaser.GameObjects.Image | Phaser.GameObjects.Text>();
  // ⚠️2026-07-19: doc.nodes 배열 순서가 에디터 저작 depth 순서와 다르다(blank.json 확인) — `setDepth()`만으론
  //   부족하다. Phaser Container 는 자식을 depth 로 자동 정렬하지 않고 **list 배열 순서 그대로** 그린다(씬
  //   루트 디스플레이 리스트와 달리 자동 depthSort 없음) — authored depth 오름차순으로 미리 정렬해서 추가해야
  //   뒷단(낮은 depth) 배경이 앞단(높은 depth) 요소를 덮어버리지 않는다.
  const sortedNodes = [...doc.nodes].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));
  for (const n of sortedNodes) {
    if (n.visible === false) continue;
    let obj: Phaser.GameObjects.Image | Phaser.GameObjects.Text | null = null;
    if (n.type === 'image' && n.key) {
      if (!scene.textures.exists(n.key)) continue; // 텍스처 누락 방어.
      const img = scene.add.image(n.x * scale, n.y * scale, n.key);
      if (n.w && n.h) img.setDisplaySize(n.w * scale, n.h * scale);
      obj = img;
    } else if (n.type === 'text') {
      const family = n.fontFamily ? `"${n.fontFamily}", "Jua", sans-serif` : '"Jua", sans-serif';
      const t = scene.add.text(n.x * scale, n.y * scale, n.text ?? '', {
        fontFamily: family,
        fontSize: `${Math.round((n.fontSize ?? 20) * scale)}px`,
        color: n.color ?? '#ffffff',
        align: 'center',
      });
      if (n.stroke && (n.strokeW ?? 0) > 0) t.setStroke(n.stroke, (n.strokeW ?? 0) * 2 * scale);
      if (n.shadow) t.setShadow((n.shadowX ?? 2) * scale, (n.shadowY ?? 2) * scale, n.shadowColor ?? '#000000', (n.shadowBlur ?? 2) * scale, false, true);
      obj = t;
    }
    if (!obj) continue;
    obj.setOrigin(0.5, 0.5);
    obj.setDepth(n.depth ?? 0);
    inner.add(obj);
    byId.set(n.id, obj);
  }

  // 닫기(✕) 버튼 = layer_8(up_DailyMission_08_v3, 패널 우상단) — 저작만 돼 있고 미배선이었다(2026-07-19 PO 지시).
  byId.get('layer_8')?.setInteractive({ useHandCursor: true }).on('pointerdown', cancel);

  // ── 동적 배선 ──
  // 레벨 번호(‘10’) → 진입할 레벨.
  (byId.get('layer_3_copy4') as Phaser.GameObjects.Text | undefined)?.setText(`${level}`);
  // **게임비 = 레벨 곡선 × 도전 배수**(경제모델 P3 적용). 표시=차감액 동일(정직). 부족 시 적색.
  const costTxt = byId.get('layer_3_copy2') as Phaser.GameObjects.Text | undefined;
  const playBg = byId.get('layer_2') as Phaser.GameObjects.Image | undefined;
  const playTxt = byId.get('layer_3') as Phaser.GameObjects.Text | undefined;
  let mult = 1; // 선택된 도전 배수.
  const refreshCost = (): boolean => {
    const fee = entryFeeFor(level, mult);
    const ok = loadSave().coins >= fee;
    costTxt?.setText(fee.toLocaleString()).setColor(ok ? '#fcbe03' : '#e74c3c');
    playBg?.setTint(ok ? 0xffffff : 0x9a9a9a); // 코인 부족 = 회색 처리.
    return ok;
  };
  // **도전 배수 순환 배지**(PO 2026-07-17) — 보물상자 옆 배지(layer_6=UI_Play_05)를 탭하면 x1→x2→x3→x5 루프.
  const badge = byId.get('layer_6') as Phaser.GameObjects.Image | undefined;
  const initialMult = Math.max(1, Math.floor(opts.initialMult ?? 1));
  if (badge) wireChallengeBadge(scene, inner, badge, level, initialMult, opts.toast, (m) => { mult = m; refreshCost(); });
  else if (costTxt) createChallengeBadge(scene, inner, level, costTxt.x + 210 * scale, costTxt.y, 96 * scale, initialMult, opts.toast, (m) => { mult = m; refreshCost(); });
  refreshCost();

  const doPlay = (): void => {
    if (closing) return; // 닫힘 애니 중 결제 방지.
    const fee = entryFeeFor(level, mult);
    const s = loadSave();
    if (s.coins < fee) {
      sfx('no_coin');
      opts.toast('코인이 부족해요');
      return;
    }
    sfx('floor_select');
    s.coins = Math.max(0, s.coins - fee);
    writeSave(s);
    opts.onCoinsChanged?.(s.coins);
    closing = true; // 곧바로 씬 전환 — 닫힘 연출 없이 즉시 파괴(중복 입력만 차단).
    layer.destroy();
    opts.onPlay({ level, mult });
  };
  if (playBg) {
    const pressTargets = [playBg, playTxt].filter(Boolean) as Phaser.GameObjects.GameObject[];
    playBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      // displaySize 이미지는 절대 scale 트윈이 크기를 깨므로 y 상대 넛지로 눌림 피드백.
      scene.tweens.add({ targets: pressTargets, y: '+=6', duration: 80, yoyo: true, onComplete: doPlay });
    });
  }

  // 닫기(✕) — 패널(layer_1) 아트 우상단에 히트존.
  const panel = doc.nodes.find((n) => n.id === 'layer_1');
  if (panel?.w && panel.h) {
    const zx = (panel.x + panel.w * 0.46) * scale;
    const zy = (panel.y - panel.h * 0.47) * scale;
    const z = scene.add.zone(zx, zy, 120 * scale, 120 * scale).setOrigin(0.5).setInteractive({ useHandCursor: true });
    z.on('pointerdown', cancel);
    inner.add(z);
  }

  // **🏠 홈으로** — 패널 바깥 하단(PO 2026-07-29 스샷 위치). 이미지 버튼(UI_23_2)이 있으면 그것을, 없으면 텍스트.
  if (opts.onHome) {
    const homeY = panel?.h ? (panel.y + panel.h * 0.5) * scale + 150 : H - 300;
    const onHome = (): void => {
      if (closing) return;
      closing = true;
      sfx('level_close');
      layer.destroy();
      opts.onHome?.();
    };
    const homeKey = 'up_Solitare_UI_23_2';
    if (scene.textures.exists(homeKey)) {
      const img = scene.add.image(W / 2, homeY, homeKey);
      const src = img.texture.getSourceImage() as { width: number; height: number };
      img.setDisplaySize(440, 440 * (src.height / src.width));
      img.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        scene.tweens.add({ targets: img, y: '+=6', duration: 80, yoyo: true, onComplete: onHome });
      });
      inner.add(img);
    } else {
      const t = scene.add
        .text(W / 2, homeY, '🏠 홈으로', { fontFamily: '"Jua", sans-serif', fontSize: '44px', color: '#ffffff', backgroundColor: '#7a4a1a', padding: { x: 40, y: 18 } })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', onHome);
      inner.add(t);
    }
  }

  popupOrganicIn(scene, scrim, frame); // 유기체(젤리) 열림 연출(기존 단순 페이드인 대체).

  return { layer, close };
}

/**
 * **도전 배수 순환 배지** — 단일 배지(보물상자 옆 UI_Play_05)를 탭하면 해금된 배수를
 *   **x1 → x2 → x3 → x5 → x1** 루프로 순환한다. 잠긴 배수는 순환에서 제외. initialMult 로 직전 선택 유지.
 *   배지 아트(05-{mult})가 있으면 텍스처 교체, 없으면 프레임 + '×N' 텍스트 오버레이(디자이너 추가 시 자동 승격).
 */
export function wireChallengeBadge(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  badge: Phaser.GameObjects.Image,
  level: number,
  initialMult: number,
  toast: (msg: string) => void,
  onChange: (m: number) => void,
): void {
  const unlocked = challengeOptions(level).filter((o) => o.unlocked).map((o) => o.mult);
  const nextLocked = challengeOptions(level).find((o) => !o.unlocked);
  const mults = unlocked.length > 0 ? unlocked : [1];
  const bw = badge.displayWidth;
  const bh = badge.displayHeight;
  // 배지 위 '×N' 오버레이(아트 없는 배수용) — 기본 숨김.
  const overlay = scene.add
    .text(badge.x, badge.y, '', { fontFamily: '"Jua", sans-serif', fontSize: `${Math.round(bh * 0.52)}px`, color: '#ffe14d' })
    .setOrigin(0.5)
    .setDepth(badge.depth + 1)
    .setVisible(false);
  overlay.setStroke('#7a3b00', Math.max(3, bh * 0.06));
  layer.add(overlay);
  const setBadge = (mult: number): void => {
    const artKey = `up_Solitare_UI_Play_05-${mult}`;
    if (scene.textures.exists(artKey)) {
      badge.setTexture(artKey).setDisplaySize(bw, bh);
      overlay.setVisible(false);
    } else {
      // 아트 없음 — 프레임(05-2) 위에 '×N' 텍스트(베이크된 숫자를 덮도록 크게).
      if (scene.textures.exists('up_Solitare_UI_Play_05-2')) badge.setTexture('up_Solitare_UI_Play_05-2').setDisplaySize(bw, bh);
      overlay.setText(`×${mult}`).setVisible(true);
    }
  };
  let idx = Math.max(0, mults.indexOf(initialMult));
  setBadge(mults[idx]);
  onChange(mults[idx]);
  // 순환 가능하면 탭 유도 펄스.
  if (mults.length > 1) scene.tweens.add({ targets: badge, scaleX: badge.scaleX * 1.08, scaleY: badge.scaleY * 1.08, duration: 720, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  badge.setInteractive({ useHandCursor: true });
  badge.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
    ev?.stopPropagation?.(); // 딤 배경 닫힘 방지.
    if (mults.length <= 1) {
      sfx('build_fail');
      toast(nextLocked ? `x${nextLocked.mult} 도전은 Lv ${nextLocked.unlockLevel}에 열려요` : '더 높은 배수는 아직 없어요');
      return;
    }
    sfx('button');
    idx = (idx + 1) % mults.length;
    setBadge(mults[idx]);
    onChange(mults[idx]);
    scene.tweens.add({ targets: badge, scaleX: badge.scaleX * 1.18, scaleY: badge.scaleY * 1.18, duration: 120, yoyo: true, ease: 'Back.easeOut' });
  });
}

/** 코드 드로우 진입 팝업용 — 배지 이미지를 만들어 순환 배선(에디터 노드 없을 때). */
export function createChallengeBadge(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  level: number,
  x: number,
  y: number,
  size: number,
  initialMult: number,
  toast: (msg: string) => void,
  onChange: (m: number) => void,
): void {
  const key = scene.textures.exists('up_Solitare_UI_Play_05-1') ? 'up_Solitare_UI_Play_05-1' : '';
  if (!key) return; // 배지 아트 없으면 생략(폴백은 배수 미표시).
  const badge = scene.add.image(x, y, key).setDisplaySize(size, size).setDepth(layer.depth + 5);
  layer.add(badge);
  wireChallengeBadge(scene, layer, badge, level, initialMult, toast, onChange);
}
