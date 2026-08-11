/**
 * skill.ts — **봇의 실력 모형**(순수).
 *
 * 난이도 표(`stage.STAGE_TUNING`)를 손으로 맞출 수는 없다. 손잡이가 셋(처리량·판 시간·주문 바탕시간)에
 * 메뉴 배율·재료 수·미션까지 얽혀 있어서, 하나를 만지면 어디가 어떻게 되는지 **감으로는 안 보인다.**
 * 그래서 봇에게 수천 판을 시켜 보고 숫자로 본다(`simulate.ts`).
 *
 * ⚠️⚠️ **이 게임의 조작은 「탭 순서 + 반응 속도」가 거의 전부다.** 조준도 경로도 없다.
 * 그래서 실력을 두 값으로 줄일 수 있다 —
 *   · `tapMs`   탭 하나에 걸리는 시간(읽고 손이 가는 시간까지)
 *   · `slipRate` 한 주문에서 손이 꼬일 확률(그만큼 시간을 더 쓰거나 별을 깎인다)
 * 여기에 「카드를 고르는 데 걸리는 시간」과 「마무리를 챙기는가」를 더하면 사람처럼 움직인다.
 *
 * ⚠️ 이 값들은 **측정치가 아니라 가정**이다. 실제 플레이 로그가 생기면 그때 맞춰 넣어야 한다 —
 *    지금은 「초보/보통/숙련」이 서로 얼마나 벌어지는지를 보는 자다.
 */

export interface Skill {
  readonly name: string;
  /** 탭 하나(밥통·재료·칼·종)에 걸리는 시간. */
  readonly tapMs: number;
  /** 카드 두 장을 읽고 고르는 데 걸리는 시간. */
  readonly decideMs: number;
  /** 한 주문에서 손이 꼬일 확률 — 시간을 더 쓰고 별도 한 등급 깎인다. */
  readonly slipRate: number;
  /** 꼬였을 때 더 쓰는 시간. */
  readonly slipMs: number;
  /**
   * **마무리(참기름·깨소금)를 챙기는 비율.**
   * ⚠️ 챙기면 별이 오르고 시간을 쓴다 — 빠듯할수록 버리는 것이 이 게임의 판단이다.
   */
  readonly seasonRate: number;
  /**
   * **비싼 카드를 고르는 성향**(0 = 늘 싼 쪽 · 1 = 늘 비싼 쪽).
   * ⚠️ 초보는 안전한 쪽으로 몰리고 숙련자는 값을 본다 — 같은 표라도 체감 난이도가 갈리는 지점이다.
   */
  readonly greed: number;
  /** **미리 받기·선행 입력을 쓰는가** — 쓰면 주문 사이의 뜸이 사라진다. */
  readonly usesPreInput: boolean;
}

/**
 * 세 실력 — 이 셋이 **다 같이 납득되는 곡선**이라야 표가 맞은 것이다.
 * 초보가 3판에서 벽에 부딪히거나 숙련자가 20판까지 한 번도 안 지면 표가 틀린 것이다.
 */
export const SKILLS: readonly Skill[] = [
  {
    name: '초보',
    tapMs: 900,
    decideMs: 1600,
    slipRate: 0.22,
    slipMs: 1500,
    seasonRate: 0.3,
    greed: 0.15,
    usesPreInput: false,
  },
  {
    name: '보통',
    tapMs: 620,
    decideMs: 1000,
    slipRate: 0.1,
    slipMs: 1100,
    seasonRate: 0.6,
    greed: 0.5,
    usesPreInput: true,
  },
  {
    name: '숙련',
    tapMs: 380,
    decideMs: 600,
    slipRate: 0.03,
    slipMs: 800,
    seasonRate: 0.85,
    greed: 0.9,
    usesPreInput: true,
  },
];

export const skillByName = (name: string): Skill =>
  SKILLS.find((s) => s.name === name) ?? SKILLS[1]!;
