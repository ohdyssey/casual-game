/**
 * officeTalk.ts — **공공건물 대화 시스템**(소방수·경찰관·세무원·우체국·시장이 플레이어에게 말 걸기).
 *
 * · 말풍선 = Solitare_UI_11(중앙 꼬리). 내용은 **짧은 대사 텍스트**(말풍선이 작으므로 ≤2줄).
 * · 전역 1인 발화(동시 금지) — 홈 진입 10~18s 후 첫 발신, 이후 45~90s 랜덤 간격(띄엄띄엄).
 * · 캐릭터별 대사 6종 **로테이션**(localStorage 저장 — 재접속해도 이어서 다음 대사).
 * · **말풍선 탭 = 같은 화자의 다음 메시지로 즉시 회전**(유지시간 리셋).
 * · 공공건물 부지가 화면에 보일 때만 발신(안 보이면 30s 뒤 재시도).
 * 설계 문서: docs/OFFICE_TALK_DESIGN.md
 */
import Phaser from 'phaser';
import { sfx } from '../audio.js';

export type OfficeRole = 'fire' | 'police' | 'tax' | 'post' | 'mayor';

export interface OfficeSpeaker {
  readonly img: Phaser.GameObjects.Image;
  readonly role: OfficeRole;
}

/** 캐릭터별 대사(짧게 — 작은 말풍선 2줄 이내). 탭할 때마다 순서대로 회전. */
const DIALOGUE: Record<OfficeRole, readonly string[]> = {
  fire: [
    '가스 밸브 잠그셨죠?\n불조심이 최고예요!',
    '문어발 콘센트는\n화재 1순위입니다!',
    '환기구 기름때가\n제일 무섭습니다.',
    '난로·실외기 조심!\n계절마다 불씨가 달라요.',
    '소방 점검 합격!\n소화기 위치는 아시죠?',
    '최고의 소방관은\n사장님의 "조심"입니다.',
  ],
  police: [
    '좀도둑 신고가 늘었어요.\n현금은 금고에!',
    '도둑은 "깜빡한 문"을\n좋아합니다. 문단속!',
    '수상한 사람 보이면\n바로 신고해 주세요.',
    'CCTV 사각지대만 없애도\n도난이 절반 줍니다.',
    '밤에 환한 가게는\n도둑이 피해 갑니다.',
    '바쁠수록 계산대 주변을\n한 번 더 살펴 주세요.',
  ],
  tax: [
    '매출이 늘면 세금도\n늘어요. 아시죠?',
    '오늘 매출은 오늘 기록!\n절세의 첫걸음입니다.',
    '사장님의 세금이\n이 도시를 움직입니다.',
    '영수증은 꼭 모아 두세요.\n공제받을 때 웃어요.',
    '새 층 축하드려요!\n다음 신고 잊지 마시고요.',
    '성실 납세자에겐\n좋은 일만 생깁니다!',
  ],
  post: [
    '도시의 소식은 전부\n제가 배달해 드릴게요!',
    '좋은 소식은 예고 없이\n옵니다. 우편함 확인!',
    '사장님 가게 소문,\n우표보다 빨리 퍼져요!',
    '비가 와도 눈이 와도\n배달은 계속됩니다.',
    '새 이벤트 소식이\n곧 도착할 예정이에요!',
    '택배가 늘었다는 건\n장사가 잘된다는 뜻이죠?',
  ],
  mayor: [
    '이 도시의 중심은\n사장님 타워예요!',
    '층이 오를 때마다\n스카이라인이 바뀝니다.',
    '다음 분기엔 가로수를\n더 심을 겁니다.',
    '이 타워 덕에 동네가\n살아났대요. 고마워요!',
    '도시는 혼자 크지 않죠.\n시청은 사장님 편!',
    '거리가 사장님 불빛으로\n가득할 그날까지!',
  ],
};

const STORE_KEY = 'solitaire.officeTalk.v1'; // { rot: {role: idx}, last: role }
const BUBBLE_W = 270; // 말풍선 표시 폭(작은 풍선 — 대사도 짧게 유지).
const HOLD_MS = 8000; // 자동 닫힘(탭 시 리셋).
const FIRST_DELAY: [number, number] = [10_000, 18_000];
const NEXT_DELAY: [number, number] = [45_000, 90_000];
const RETRY_DELAY = 30_000; // 부지가 화면 밖일 때 재시도 간격.

interface TalkState {
  rot: Partial<Record<OfficeRole, number>>;
  last?: OfficeRole;
}

function loadState(): TalkState {
  try {
    return (JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as TalkState) ?? { rot: {} };
  } catch {
    return { rot: {} };
  }
}
function saveState(s: TalkState): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* 무시 */
  }
}

export interface OfficeTalkHandle {
  /** 즉시 발화(디버그/검증용) — 스케줄과 무관하게 지금 말풍선을 띄운다. */
  fire(role?: OfficeRole): void;
}

/**
 * 대화 디렉터 시작 — speakers(공공건물 관리자 이미지+역할)와 부지 가시성 게이트를 받아
 * 띄엄띄엄 1인 발화를 반복한다. 씬 재시작 시 타이머/오브젝트는 Phaser 가 함께 정리한다.
 */
export function startOfficeTalk(
  scene: Phaser.Scene,
  speakers: readonly OfficeSpeaker[],
  isStageVisible: () => boolean,
): OfficeTalkHandle {
  const state = loadState();
  if (!state.rot) state.rot = {};
  let bubble: Phaser.GameObjects.GameObject[] = [];
  let dismissTimer: Phaser.Time.TimerEvent | undefined;
  const pin = (o: Phaser.GameObjects.GameObject): void => {
    (scene as { pinToWorld?: (x: Phaser.GameObjects.GameObject) => void }).pinToWorld?.(o);
  };
  const bubbleKey = (): string | null =>
    scene.textures.exists('up_Solitare_UI_11') ? 'up_Solitare_UI_11' : scene.textures.exists('ord_bubble_m') ? 'ord_bubble_m' : null;

  const rand = (a: number, b: number): number => Math.floor(a + Math.random() * (b - a));

  const clear = (fade = true): void => {
    dismissTimer?.remove();
    dismissTimer = undefined;
    const objs = bubble;
    bubble = [];
    for (const o of objs) {
      if (!fade) {
        o.destroy();
        continue;
      }
      scene.tweens.add({ targets: o, alpha: 0, duration: 240, ease: 'Quad.easeIn', onComplete: () => o.destroy() });
    }
  };

  /** 다음 대사(회전) — 표시 후 인덱스를 전진·저장. */
  const nextMsg = (role: OfficeRole): string => {
    const list = DIALOGUE[role];
    const i = (state.rot[role] ?? 0) % list.length;
    state.rot[role] = i + 1;
    saveState(state);
    return list[i];
  };

  const show = (sp: OfficeSpeaker): void => {
    const key = bubbleKey();
    if (!key || !sp.img.active) return;
    clear(false);
    state.last = sp.role;
    saveState(state);
    sfx('toast', { volume: 0.35 });
    // 말풍선 — 화자 머리 위(꼬리 중앙 하단 = UI_11 tailX 0.5).
    const b = sp.img.getBounds();
    const tailY = b.top - 2;
    const bub = scene.add.image(b.centerX, tailY, key).setOrigin(0.5, 1).setDepth(sp.img.depth + 40).setAlpha(0);
    pin(bub);
    const scale = BUBBLE_W / bub.width;
    bub.setScale(scale * 0.7);
    const bubH = bub.height * scale;
    const txt = scene.add
      .text(b.centerX, tailY - bubH * 0.57, '', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '25px',
        color: '#3a2a1e',
        align: 'center',
        wordWrap: { width: BUBBLE_W * 0.8 },
      })
      .setOrigin(0.5)
      .setDepth(sp.img.depth + 41)
      .setAlpha(0);
    pin(txt);
    txt.setText(nextMsg(sp.role));
    bubble = [bub, txt];
    scene.tweens.add({ targets: bub, alpha: 1, scale, duration: 240, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: txt, alpha: 1, duration: 240, delay: 60, ease: 'Sine.easeOut' });
    // **탭 = 다음 메시지로 회전**(유지시간 리셋). 풍선 전체가 히트 영역.
    bub.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      sfx('toast', { volume: 0.25 });
      txt.setText(nextMsg(sp.role));
      txt.setScale(0.9);
      scene.tweens.add({ targets: txt, scale: 1, duration: 160, ease: 'Back.easeOut' });
      armDismiss();
    });
    armDismiss();
  };

  const armDismiss = (): void => {
    dismissTimer?.remove();
    dismissTimer = scene.time.delayedCall(HOLD_MS, () => clear(true));
  };

  /** 화자 선택 — 직전 화자 제외 랜덤. */
  const pick = (): OfficeSpeaker | undefined => {
    const alive = speakers.filter((s) => s.img.active);
    if (!alive.length) return undefined;
    const pool = alive.length > 1 ? alive.filter((s) => s.role !== state.last) : alive;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const tick = (): void => {
    // 발화 중이거나 부지가 화면 밖이면 잠시 후 재시도(띄엄띄엄 유지).
    if (bubble.length > 0 || !isStageVisible()) {
      scene.time.delayedCall(RETRY_DELAY, tick);
      return;
    }
    const sp = pick();
    if (sp) show(sp);
    scene.time.delayedCall(rand(NEXT_DELAY[0], NEXT_DELAY[1]), tick);
  };

  scene.time.delayedCall(rand(FIRST_DELAY[0], FIRST_DELAY[1]), tick);

  return {
    fire(role?: OfficeRole): void {
      const sp = role ? speakers.find((s) => s.role === role && s.img.active) : pick();
      if (sp) show(sp);
    },
  };
}
