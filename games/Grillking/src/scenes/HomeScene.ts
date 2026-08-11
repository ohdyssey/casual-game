/**
 * HomeScene — 진입화면(home). phaser-ui-editor 로 디자인한 홈(public/ui/layouts/blank.json)을
 * 그대로 렌더하고, 그 위에 동적 동작만 얹는다. 에디터 디자인이 단일 진실 공급원(SSOT).
 *
 *  · 굽는 쉐프(spriteDocClip)·등(lantern)·로고는 살아있는 프리뷰(자동 애니 + 둥실 모션).
 *  · 코인/레벨은 세이브에서 읽어 표시, [입장] 버튼이 게임플레이(grill 씬)로 전환한다.
 *  · 이벤트·무료보상은 실시간 카운트다운, 무료보상은 쿨다운마다 코인을 지급한다.
 *
 * 흐름: boot → load → **home(이 씬)** → [입장] → grill(게임플레이, main.json).
 * 레이아웃/업로드/스프라이트 텍스처는 Load 씬의 loadGameAssets 가 이미 프리로드했다.
 */
import Phaser from 'phaser';
import { HOME_LAYOUT_KEY } from '../assets.js';
import { sfx, isSfxOn, setSfxOn } from '../audio.js';
import { loadSave, updateSave } from '../save.js';
import { buildLayout, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import { openPopup, showToast } from './popups.js';

/** 무료보상 — 쿨다운(8시간)마다 지급 코인. */
const FREE_REWARD_COINS = 100;
const FREE_REWARD_COOLDOWN_MS = 8 * 60 * 60 * 1000;
/** 홈 전용 상태(무료보상 마지막 수령 시각) — 세이브 스키마와 분리해 별도 키로 보관. */
const HOME_STATE_KEY = 'grillking_home_v1';

interface HomeState {
  readonly freeClaimedAt: number;
}

function loadHomeState(): HomeState {
  try {
    const raw = localStorage.getItem(HOME_STATE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        const o = parsed as Record<string, unknown>;
        if (typeof o.freeClaimedAt === 'number' && o.freeClaimedAt >= 0) return { freeClaimedAt: o.freeClaimedAt };
      }
    }
  } catch {
    /* 손상 데이터 → 기본값 */
  }
  return { freeClaimedAt: 0 };
}

function saveHomeState(s: HomeState): void {
  try {
    localStorage.setItem(HOME_STATE_KEY, JSON.stringify(s));
  } catch {
    /* 저장 불가 — 무시 */
  }
}

function formatCoins(n: number): string {
  return Math.max(0, Math.floor(n)).toLocaleString('en-US');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function fmtHMS(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
}

/** 다음 로컬 자정까지 남은 ms(일일 이벤트 리셋용). */
function msToNextMidnight(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - now.getTime();
}

export class HomeScene extends Phaser.Scene {
  private layout!: LayoutIndex;
  private started = false;
  private coinText?: Phaser.GameObjects.Text;
  private eventTimerText?: Phaser.GameObjects.Text;
  private freeTimerText?: Phaser.GameObjects.Text;
  private freeIcon?: Phaser.GameObjects.Image;
  private freePulse?: Phaser.Tweens.Tween;
  private freeBaseSX = 0;
  private freeBaseSY = 0;
  /** 무료보상 마지막 수령 시각(캐시) — 매 틱 localStorage 재파싱을 피한다. 수령 시에만 갱신. */
  private freeClaimedAt = 0;

  constructor() {
    super('home');
  }

  create(): void {
    this.started = false;
    this.freePulse = undefined;
    this.freeClaimedAt = loadHomeState().freeClaimedAt;

    const doc = this.cache.json.get(HOME_LAYOUT_KEY) as LayoutDoc | undefined;
    // 레이아웃이 없으면(에디터 미산출) 바로 게임플레이로 폴백 — 진행을 막지 않는다.
    if (!doc || !doc.nodes?.length) {
      this.scene.start('grill');
      return;
    }

    this.layout = buildLayout(this, doc);
    this.fitLayoutToHD(doc);

    this.bindCoins();
    this.wireEnter();
    this.wireTopBar();
    this.wireSideButtons();
    this.wireBottomNav();
    this.wireFreeReward();
    // 장식 모션(등 흔들림 등)은 에디터가 노드에 저작한 anim 을 buildLayout→applyLayoutAnims 가 재생한다.
    // (이전의 코드 임시 tween 제거 — SSOT: 효과는 에디터에서 저작)

    // 이벤트/무료보상 실시간 카운트다운(텍스트 노드는 여기서 1회 조회).
    this.eventTimerText = this.layout.tryById<Phaser.GameObjects.Text>('layer_13_copy');
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickClocks() });
    this.tickClocks();

    this.cameras.main.fadeIn(220, 43, 24, 16); // #2B1810 테마색에서 페이드인
  }

  // ─────────────────────── 반응형 보정 ───────────────────────

  /**
   * 진입화면(blank.json)은 아직 720×1280 저작 → 세로 HD(1080×2400) 캔버스에 균일 맞춤.
   *   · 배경(layer_1)은 루트에 남겨 화면 전체 cover.
   *   · 나머지 UI 는 폭 기준 배율(1080/720=1.5)로 컨테이너에 담아 세로 가운데 정렬.
   * (게임플레이 main.json 은 이미 네이티브 1080×2400 라 이 처리가 필요 없다.)
   */
  private fitLayoutToHD(doc: LayoutDoc): void {
    const scale = this.scale.width / doc.frame.designW;

    // 배경은 실제 캔버스(1080×2400)를 덮도록 cover(코어 coverBackground 는 720 폭 가정이라 여기선 직접 계산).
    const bg = this.layout.tryById<Phaser.GameObjects.Image>('layer_1');
    if (bg) {
      const cover = Math.max(this.scale.width / bg.width, this.scale.height / bg.height);
      bg.setScale(cover).setPosition(this.scale.width / 2, this.scale.height / 2);
    }

    // 배경을 제외한 모든 노드를 depth 순으로 배율 컨테이너에 재부모화(원 좌표=로컬 유지).
    const entries = this.layout
      .entries()
      .filter((e) => e.node.id !== 'layer_1')
      .sort((a, b) => (a.node.depth ?? 0) - (b.node.depth ?? 0));
    const contentH = doc.frame.designH * scale;
    const offsetY = Math.max(0, (this.scale.height - contentH) / 2);
    this.add
      .container(0, offsetY, entries.map((e) => e.obj))
      .setScale(scale)
      .setDepth(2);
  }

  // ─────────────────────── 코인/세이브 표시 ───────────────────────

  private bindCoins(): void {
    this.coinText = this.layout.tryById<Phaser.GameObjects.Text>('layer_13');
    this.coinText?.setText(formatCoins(loadSave().coins));
  }

  private refreshCoins(coins: number): void {
    this.coinText?.setText(formatCoins(coins));
    if (this.coinText) {
      this.tweens.add({ targets: this.coinText, scale: { from: 1.25, to: 1 }, duration: 240, ease: 'Back.easeOut' });
    }
  }

  // ─────────────────────── 입장(게임 시작) ───────────────────────

  private wireEnter(): void {
    const btn = this.layout.tryById<Phaser.GameObjects.Image>('layer_9');
    if (!btn) {
      // 입장 버튼 노드가 없으면 화면 어디든 탭으로 시작(진행 보장).
      if (import.meta.env?.DEV) console.warn('[home] 입장 버튼(layer_9) 없음 — 화면 탭으로 시작 폴백');
      this.input.once('pointerdown', () => this.launch());
      return;
    }
    const baseSX = btn.scaleX;
    const baseSY = btn.scaleY;
    btn.setInteractive({ useHandCursor: true });
    // 시선 유도용 펄스(누르는 순간 멈췄다가 탭 처리).
    const pulse = this.tweens.add({
      targets: btn,
      scaleX: baseSX * 1.05,
      scaleY: baseSY * 1.05,
      duration: 720,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    btn.on('pointerup', () => {
      pulse.remove();
      sfx('place');
      this.launch();
    });
  }

  /** 게임플레이로 전환 — 페이드 아웃 후 1회만. */
  private launch(): void {
    if (this.started) return;
    this.started = true;
    this.cameras.main.fadeOut(260, 43, 24, 16);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('grill'));
  }

  // ─────────────────────── 상단 바(설정/메일/코인/로고) ───────────────────────

  private wireTopBar(): void {
    this.makeButton('layer_11', () => this.openSettings()); // 설정
    this.makeButton('layer_11_copy', () => {
      // 메시지함 — 알림 배지 숨김 + 안내.
      this.layout.tryById<Phaser.GameObjects.Image>('layer_11_copy9')?.setVisible(false);
      showToast(this, '새 메시지가 없어요!');
    });
    this.makeButton('layer_11_copy2', () => showToast(this, '코인 충전소는 준비 중이에요!')); // 코인 패널
  }

  // ─────────────────────── 좌/우 사이드 버튼 ───────────────────────

  private wireSideButtons(): void {
    this.makeButton('layer_11_copy5', () => showToast(this, '미션은 게임 플레이 중에 진행돼요!')); // 미션
    this.makeButton('layer_11_copy6', () => showToast(this, '이벤트가 곧 시작돼요!')); // 이벤트
    this.makeButton('layer_11_copy8', () => showToast(this, '상점은 준비 중이에요!')); // 상점
    this.makeButton('layer_11_copy7', () => showToast(this, '시즌 패스가 곧 열려요!')); // 패스
  }

  // ─────────────────────── 하단 내비게이션 ───────────────────────

  private wireBottomNav(): void {
    this.makeButton('layer_7', () => showToast(this, '여기가 홈이에요!')); // 홈(현재)
    this.makeButton('layer_7_copy', () => this.openSettings()); // 메뉴
    this.makeButton('layer_7_copy2', () => showToast(this, '랭킹은 허브에서 곧 만나요!')); // 랭킹
    this.makeButton('layer_7_copy3', () => showToast(this, '친구 기능은 준비 중이에요!')); // 친구
  }

  // ─────────────────────── 무료보상 ───────────────────────

  private wireFreeReward(): void {
    this.freeIcon = this.layout.tryById<Phaser.GameObjects.Image>('layer_11_copy10');
    this.freeTimerText = this.layout.tryById<Phaser.GameObjects.Text>('layer_13_copy2');
    // 기준 스케일을 펄스 시작 전(여기서) 1회 확보 — 펄스가 유일하게 스케일을 만지도록 한다.
    // (makeButton 의 누름 바운스를 붙이면 펄스 트윈과 같은 scale 속성을 다퉈 글리치 → 직접 배선.)
    if (this.freeIcon) {
      this.freeBaseSX = this.freeIcon.scaleX;
      this.freeBaseSY = this.freeIcon.scaleY;
      this.freeIcon.setInteractive({ useHandCursor: true });
      this.freeIcon.on('pointerup', () => {
        sfx('tap');
        this.claimFreeReward();
      });
    }
  }

  private freeRewardRemainMs(): number {
    return this.freeClaimedAt + FREE_REWARD_COOLDOWN_MS - Date.now();
  }

  private claimFreeReward(): void {
    const remain = this.freeRewardRemainMs();
    if (remain > 0) {
      showToast(this, `다음 보상까지 ${fmtHMS(remain)}`);
      return;
    }
    const save = updateSave({ coins: loadSave().coins + FREE_REWARD_COINS });
    this.freeClaimedAt = Date.now();
    saveHomeState({ freeClaimedAt: this.freeClaimedAt });
    sfx('win');
    this.refreshCoins(save.coins);
    this.stopFreePulse();
    showToast(this, `무료보상 +${FREE_REWARD_COINS} 코인!`);
    this.tickClocks();
  }

  private startFreePulse(): void {
    if (this.freePulse || !this.freeIcon) return;
    this.freePulse = this.tweens.add({
      targets: this.freeIcon,
      scaleX: this.freeBaseSX * 1.12,
      scaleY: this.freeBaseSY * 1.12,
      duration: 560,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** 펄스 정지 + 원래(비균일) 스케일로 정확히 복원. 펄스가 없을 땐 아무것도 안 함. */
  private stopFreePulse(): void {
    if (!this.freePulse) return;
    this.freePulse.remove();
    this.freePulse = undefined;
    if (this.freeIcon) {
      this.freeIcon.scaleX = this.freeBaseSX;
      this.freeIcon.scaleY = this.freeBaseSY;
    }
  }

  // ─────────────────────── 실시간 카운트다운 ───────────────────────

  private tickClocks(): void {
    this.eventTimerText?.setText(fmtHMS(msToNextMidnight()));

    const remain = this.freeRewardRemainMs();
    if (remain <= 0) {
      this.freeTimerText?.setText('받기!');
      this.startFreePulse();
    } else {
      this.freeTimerText?.setText(fmtHMS(remain));
      this.stopFreePulse();
    }
  }

  // ─────────────────────── 공용: 버튼/팝업 ───────────────────────

  /** 이미지 노드를 버튼화 — 누름 바운스 + 탭 콜백(노드 없으면 무시). */
  private makeButton(id: string, onTap: () => void): void {
    const obj = this.layout.tryById<Phaser.GameObjects.Image>(id);
    if (!obj) return;
    const baseSX = obj.scaleX;
    const baseSY = obj.scaleY;
    obj.setInteractive({ useHandCursor: true });
    obj.on('pointerdown', () => this.tweens.add({ targets: obj, scaleX: baseSX * 0.92, scaleY: baseSY * 0.92, duration: 70 }));
    const restore = (): void => {
      this.tweens.add({ targets: obj, scaleX: baseSX, scaleY: baseSY, duration: 90 });
    };
    obj.on('pointerup', () => {
      restore();
      sfx('tap');
      onTap();
    });
    obj.on('pointerout', restore);
  }

  private openSettings(): void {
    const save = loadSave();
    openPopup(this, {
      title: '설정',
      lines: [`레벨 ${save.level} · 코인 ${formatCoins(save.coins)}`],
      dismissible: true,
      buttons: [
        {
          label: `사운드: ${isSfxOn() ? 'ON' : 'OFF'}`,
          color: 0x7a9cc6,
          onTap: () => {
            setSfxOn(!isSfxOn());
            showToast(this, `사운드 ${isSfxOn() ? 'ON' : 'OFF'}`);
          },
        },
        { label: '닫기', color: 0x9b8b78, small: true, onTap: () => undefined },
      ],
    });
  }
}
