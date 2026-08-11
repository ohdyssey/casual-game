/**
 * MatchScene — 대전 상대 매칭 화면.
 *
 * **실유저 매칭이 먼저**다. 서버 대기열에 들어가 상대를 기다리고, 성사되면 그 매치로 대국을
 * 시작한다. `MATCH_FALLBACK_MS` 안에 상대가 없거나 서버가 없으면(초기 동접 부족·통신 실패·
 * 접속 정보 미설정) **조용히 봇 대전으로 내려간다** — 대전 모드가 죽어 있는 것보다 낫다.
 *
 * ⚠️ 봇일 때만 '🤖 AI 상대' 배지를 단다. 실유저와 봇을 구분하는 유일한 신호이므로,
 *    "사람인 척" 하지 않기 위해 이 분기를 절대 지우지 말 것.
 *
 * ⚠️ 이 화면은 `.pue-harness/` 에 저작된 배치가 없다(하네스에는 main 하나뿐).
 *    그래서 좌표를 코드에 두었다 — 에디터에 화면이 추가되면 그 문서를 SSOT 로 삼아야 한다.
 */
import Phaser from 'phaser';
import type { MatchSnapshot } from '@casual/ttt-rules/protocol.js';
import { BGM, playSfx, startBgm, startLoopSfx, stopLoopSfx } from '../audio.js';
import { pickOpponent, type VirtualUser } from '../logic/versus.js';
import { loadVersusRecord, syncVersusRating } from '../versusStore.js';
import { cancelQueue, joinQueue } from '../net/api.js';
import { watchForMatch } from '../net/matchChannel.js';
import { fetchMatch } from '../net/api.js';
import { isOnlineEnabled, MATCH_FALLBACK_MS } from '../net/config.js';

const W = 1080;
const H = 2400;

const COLOR_ME = 0x27c4ff; // 네온 블루(내 쪽)
const COLOR_FOE = 0xff2e7e; // 네온 핑크(상대 쪽)

/**
 * 카드 배치 — 좌: 나, 우: 상대.
 * 세로 좌표는 배경 아트의 TIC.TAC.TOE 네온 로고(디자인 y 약 340~580)를 피해 잡았다.
 */
const CARD = { w: 400, h: 470, cy: 1140, myX: 290, foeX: 790 } as const;
/** 헤더(제목·내 전적) — 로고 아래, 카드 위 구간. */
const HEAD = { titleY: 660, subY: 762 } as const;

/** 상대를 찾는 데 걸리는 시간(ms) — 실제 매칭처럼 매번 조금씩 다르게. */
const SEARCH_MIN_MS = 1300;
const SEARCH_VAR_MS = 900;
/** 상대 공개 후 게임 시작까지의 뜸(ms). */
const REVEAL_HOLD_MS = 1100;

const FONT = 'Jua, sans-serif';

export class MatchScene extends Phaser.Scene {
  private foeCard!: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;
  private vsText!: Phaser.GameObjects.Text;
  private spinner!: Phaser.GameObjects.Graphics;
  /** 이미 화면을 떠났는지 — 지연 콜백이 죽은 씬을 건드리지 않게 막는다. */
  private left = false;
  /** 상대가 이미 정해졌는지 — 실유저 성사와 봇 폴백이 겹쳐 두 번 시작되는 걸 막는다. */
  private settled = false;
  /** 서버 대기열에 들어가 있는지 — 화면을 뜰 때 반드시 빼야 한다(유령 대기자 방지). */
  private queued = false;
  /** matches INSERT 구독 해제 함수. */
  private unwatch: (() => void) | null = null;
  private fallbackTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super('match');
  }

  create(): void {
    this.left = false;
    this.settled = false;
    this.queued = false;
    this.unwatch = null;
    this.fallbackTimer = null;
    this.drawBackground();

    const me = loadVersusRecord();

    this.add
      .text(W / 2, HEAD.titleY, '🆚 대전 플레이', {
        fontFamily: FONT,
        fontSize: '92px',
        color: '#E6E9FF',
      })
      .setOrigin(0.5)
      .setStroke('#0A0714', 12);

    this.add
      .text(W / 2, HEAD.subY, `내 레이팅 ${me.rating}  ·  ${me.wins}승 ${me.losses}패 ${me.draws}무`, {
        fontFamily: FONT,
        fontSize: '42px',
        color: '#BFC6E8',
      })
      .setOrigin(0.5)
      .setStroke('#0A0714', 8);

    this.buildCard(CARD.myX, CARD.cy, COLOR_ME, {
      flair: '🙂',
      name: '나',
      note: `레이팅 ${me.rating}`,
    });

    this.foeCard = this.buildCard(CARD.foeX, CARD.cy, COLOR_FOE, {
      flair: '❓',
      name: '???',
      note: '찾는 중',
    });

    this.vsText = this.add
      .text(W / 2, CARD.cy, 'VS', { fontFamily: FONT, fontSize: '86px', color: '#FFD54D' })
      .setOrigin(0.5)
      .setDepth(20)
      .setStroke('#0A0714', 12);

    this.statusText = this.add
      .text(W / 2, 1520, '상대를 찾는 중…', { fontFamily: FONT, fontSize: '56px', color: '#8FE8FF' })
      .setOrigin(0.5)
      .setStroke('#0A0714', 10);

    this.buildSpinner();
    this.buildCancelButton();

    this.cameras.main.fadeIn(220);
    startBgm(BGM.home); // 홈에서 걸린 곡을 끊지 않고 그대로 이어 받는다
    playSfx('ui_scene_in');
    // 탐색 대기음 — 상대가 나오거나 화면을 떠날 때까지 깔린다.
    startLoopSfx('match_search');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      stopLoopSfx('match_search');
      this.teardownSearch();
    });

    if (isOnlineEnabled()) {
      void this.searchOnline(me.rating);
      return;
    }
    // 서버가 없는 빌드 — 예전처럼 연출 지연 후 봇을 붙인다.
    this.time.delayedCall(SEARCH_MIN_MS + Math.random() * SEARCH_VAR_MS, () =>
      this.fallbackToBot(me.rating),
    );
  }

  // ── 실유저 매칭 ──

  /**
   * 서버 대기열에 들어가 상대를 기다린다.
   *
   * 페어링을 성사시킨 쪽은 join 응답으로 매치를 바로 받고, 기다리던 쪽은 Realtime
   * `matches` INSERT 로 알게 된다(대기자는 항상 o_player 라서 필터 하나면 된다).
   */
  private async searchOnline(myRating: number): Promise<void> {
    // 구독을 **먼저** 건다 — join 응답보다 INSERT 이벤트가 먼저 도착할 수 있다.
    const unwatch = await watchForMatch((matchId) => void this.enterOnlineMatch(matchId));
    if (this.left || this.settled) {
      unwatch();
      return;
    }
    this.unwatch = unwatch;

    const joined = await joinQueue();
    if (this.left || this.settled) return;

    if (!joined) {
      // 로그인/통신 실패 — 유저에게 서버 사정을 설명할 이유가 없다. 그냥 봇으로 붙인다.
      this.fallbackToBot(myRating);
      return;
    }

    if (joined.status === 'matched') {
      this.startOnlineMatch(joined.match);
      return;
    }

    this.queued = true;
    syncVersusRating(joined.rating); // 서버 권위 레이팅으로 로컬 캐시를 맞춘다
    this.fallbackTimer = this.time.delayedCall(MATCH_FALLBACK_MS, () =>
      void this.giveUpAndUseBot(myRating),
    );
  }

  /** Realtime 으로 성사를 알게 된 경우 — 매치 상세를 받아 대국으로 넘어간다. */
  private async enterOnlineMatch(matchId: string): Promise<void> {
    if (this.left || this.settled) return;
    const snapshot = await fetchMatch(matchId);
    if (this.left || this.settled) return;
    if (!snapshot) return; // 조회 실패 — 폴백 타이머가 알아서 봇으로 넘긴다
    this.startOnlineMatch(snapshot);
  }

  private startOnlineMatch(snapshot: MatchSnapshot): void {
    if (this.settled) return;
    this.settled = true;
    this.queued = false;
    syncVersusRating(snapshot.myRatingAt);
    this.teardownSearch();
    this.revealOpponent(
      {
        id: `u_${snapshot.matchId}`,
        name: snapshot.opponent.nickname,
        rating: snapshot.opponent.rating,
        flair: '🧑',
      },
      snapshot,
    );
  }

  /**
   * 대기 시간이 다 됐다 — 큐에서 빠지고 봇으로 간다.
   * 빠지는 찰나에 매칭이 성사됐을 수 있어서, 서버가 알려주면 그 판으로 들어간다.
   */
  private async giveUpAndUseBot(myRating: number): Promise<void> {
    if (this.left || this.settled) return;
    const res = await cancelQueue();
    this.queued = false;
    if (this.left || this.settled) return;

    if (res?.match) {
      this.startOnlineMatch(res.match);
      return;
    }
    this.fallbackToBot(myRating);
  }

  private fallbackToBot(myRating: number): void {
    if (this.settled) return;
    this.settled = true;
    this.teardownSearch();
    this.revealOpponent(pickOpponent(myRating), null);
  }

  /** 구독·폴백 타이머·대기열을 정리한다. 두 번 불려도 안전해야 한다. */
  private teardownSearch(): void {
    this.unwatch?.();
    this.unwatch = null;
    this.fallbackTimer?.remove();
    this.fallbackTimer = null;
    if (this.queued) {
      this.queued = false;
      void cancelQueue(); // 화면을 떠나도 대기열에 유령이 남지 않게(응답을 기다리지 않는다)
    }
  }

  private drawBackground(): void {
    if (this.textures.exists('bg_2')) {
      const img = this.add.image(W / 2, H / 2, 'bg_2').setDepth(0);
      const s = Math.max(W / img.width, H / img.height);
      // 배경 아트는 분위기만 남긴다 — 진하면 카드·문구 가독성을 잡아먹는다.
      img.setScale(s).setAlpha(0.35);
    }
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0714, 0.62).setDepth(1);
  }

  /** 프로필 카드 1장 — 테두리 박스 + 이모지 + 이름 + 부가정보. */
  private buildCard(
    cx: number,
    cy: number,
    color: number,
    data: { flair: string; name: string; note: string },
  ): Phaser.GameObjects.Container {
    // ⚠️ Container 자식은 add 순서대로 그려진다(.depth 로 자동 정렬되지 않는다).
    const c = this.add.container(cx, cy).setDepth(10);

    const g = this.add.graphics();
    g.fillStyle(0x140f2b, 0.92);
    g.fillRoundedRect(-CARD.w / 2, -CARD.h / 2, CARD.w, CARD.h, 36);
    g.lineStyle(6, color, 0.9);
    g.strokeRoundedRect(-CARD.w / 2, -CARD.h / 2, CARD.w, CARD.h, 36);
    c.add(g);

    const flair = this.add.text(0, -120, data.flair, { fontSize: '128px' }).setOrigin(0.5);
    flair.setName('flair');
    c.add(flair);

    const name = this.add
      .text(0, 40, data.name, { fontFamily: FONT, fontSize: '46px', color: '#E6E9FF' })
      .setOrigin(0.5);
    name.setName('name');
    c.add(name);

    const note = this.add
      .text(0, 120, data.note, { fontFamily: FONT, fontSize: '38px', color: '#9FA8D8' })
      .setOrigin(0.5);
    note.setName('note');
    c.add(note);

    const badge = this.add
      .text(0, 190, '', { fontFamily: FONT, fontSize: '32px', color: '#FFC96B' })
      .setOrigin(0.5);
    badge.setName('badge');
    c.add(badge);

    return c;
  }

  /** 카드 안의 텍스트를 이름표로 찾아 갈아 끼운다. */
  private setCardField(card: Phaser.GameObjects.Container, field: string, value: string): void {
    const node = card.getByName(field) as Phaser.GameObjects.Text | null;
    node?.setText(value);
  }

  private buildSpinner(): void {
    this.spinner = this.add.graphics().setPosition(W / 2, 1680).setDepth(10);
    this.spinner.lineStyle(12, 0x27c4ff, 1);
    this.spinner.beginPath();
    this.spinner.arc(0, 0, 58, -Math.PI / 2, Math.PI * 0.6);
    this.spinner.strokePath();
    this.tweens.add({
      targets: this.spinner,
      angle: 360,
      duration: 900,
      repeat: -1,
      ease: 'Linear',
    });
  }

  private buildCancelButton(): void {
    const y = 2060;
    const g = this.add.graphics().setDepth(10);
    g.lineStyle(5, 0x7a82ac, 0.9);
    g.strokeRoundedRect(W / 2 - 200, y - 62, 400, 124, 30);

    this.add
      .text(W / 2, y, '취소', { fontFamily: FONT, fontSize: '52px', color: '#BFC6E8' })
      .setOrigin(0.5)
      .setDepth(11);

    this.add
      .zone(W / 2, y, 400, 124)
      .setOrigin(0.5)
      .setDepth(12)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (this.left) return;
        this.left = true;
        playSfx('ui_btn_cancel');
        this.scene.start('menu');
      });
  }

  /**
   * 상대 공개 — 카드를 뒤집듯 갈아 끼우고, 잠시 뒤 대국을 시작한다.
   * `online` 이 있으면 실유저 대전(배지 없음), null 이면 봇 대전('🤖 AI 상대' 배지).
   */
  private revealOpponent(foe: VirtualUser, online: MatchSnapshot | null): void {
    if (this.left) return;
    stopLoopSfx('match_search'); // 대기음을 끊으며 발견음이 들어온다
    playSfx('match_found');

    // 스피너 정리 — 트윈을 먼저 죽이고 파괴한다(파괴된 대상의 트윈은 게임루프를 멈춘다).
    this.tweens.killTweensOf(this.spinner);
    this.spinner.destroy();

    // 카드 뒤집기: 가로로 접었다가(scaleX 0) 내용 교체 후 다시 편다.
    this.tweens.add({
      targets: this.foeCard,
      scaleX: 0,
      duration: 150,
      ease: 'Quad.In',
      onComplete: () => {
        if (this.left || !this.foeCard.active) return;
        playSfx('card_flip'); // 카드가 접혔다 펴지는 순간 = 정체가 드러나는 순간
        this.setCardField(this.foeCard, 'flair', foe.flair);
        this.setCardField(this.foeCard, 'name', foe.name);
        this.setCardField(this.foeCard, 'note', `레이팅 ${foe.rating}`);
        // 봇임을 숨기지 않는다 — 실유저와 구분되는 유일한 신호다.
        this.setCardField(this.foeCard, 'badge', online ? '🟢 실시간 대전' : '🤖 AI 상대');
        this.tweens.add({ targets: this.foeCard, scaleX: 1, duration: 220, ease: 'Back.Out' });
      },
    });

    this.statusText.setText('상대를 찾았어요!').setColor('#FFD54D');
    this.vsText.setScale(0.6);
    this.tweens.add({ targets: this.vsText, scale: 1, duration: 320, ease: 'Back.Out' });

    this.time.delayedCall(REVEAL_HOLD_MS, () => {
      if (this.left) return;
      this.left = true;
      this.cameras.main.fadeOut(180);
      this.time.delayedCall(200, () =>
        this.scene.start('play', { mode: 'versus', opponent: foe, online }),
      );
    });
  }
}
