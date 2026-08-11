/**
 * launcher — 게임 핸드오프 런처.
 *
 * 카드 클릭 → 게임을 기존 방식으로 연다(데스크탑 팝업 / 설치형 PWA 페이지 이동).
 * **로딩바와 START 버튼은 각 게임 페이지(팝업) 안에서 표시**한다 — 허브는 로딩 UI 를
 * 갖지 않는다. URL 에 `?portal=<hubOrigin>` 을 붙여, 게임이 자동 시작 대신 인게임 START
 * 게이트를 띄우게 한다(스타트 버튼을 눌러야 플레이 시작).
 *
 * 팝업은 클릭 제스처 안에서 동기적으로 열어야 차단되지 않으므로 즉시 연다.
 * 게임 창이 닫히면 onClose 로 허브 지갑을 새로고침한다(같은 출처일 때 코인 소비 반영).
 */
import { gameUrl } from '../games.config.js';
import { PORTAL_PARAM } from '@casual/core/portal/protocol';

interface GameEntry {
  id: string;
  live: boolean;
  devPort?: number;
  prodUrl?: string;
}

const GAME_ASPECT = 720 / 1280;
const CHROME_H = 92;
/** 마지막으로 실행한 게임 id 저장 키(상단 '최근 플레이' 배너용). */
const LAST_PLAYED_KEY = 'playpop_last_played_v1';

/**
 * 🚧 게임 실행 게이트 — allowlist 기반 부분 오픈(PLAY_OPEN_GAMES).
 *   · '플레이 사이트' 빌드(__PLAY_OPEN__=true) 또는 dev 서버 → 전체 게임 플레이 가능
 *   · 그 외(prod: ryanlogic.kr 브라우저 탭 + 설치형 PWA 공통) → allowlist 에 든 게임만 플레이 가능
 *   ⚠️ 설치형 PWA 도 더는 전체 개방하지 않는다 — PWA·브라우저 공통으로 allowlist 로 제한한다.
 *   (isStandalone 은 실행 방식 — 같은창 이동 vs 데스크톱 팝업 — 판별용으로만 launchGame 에서 쓴다.)
 */
// __PLAY_OPEN__ = vite.config 의 define 로 주입되는 빌드 상수(기본 false, `PLAY_OPEN=true` 빌드 시 true).
//   Vite env 파일/VITE_ 프리픽스 대신 node process.env 를 config 에서 읽어 define → 가장 견고.
declare const __PLAY_OPEN__: boolean;
const PLAY_OPEN = __PLAY_OPEN__;

/**
 * 부분 오픈 allowlist — prod(브라우저 탭·설치형 PWA 공통)에서 이 게임 id 만 플레이를 허용한다.
 *   현재 오픈(11종 배포 지정, CashPOP=고정 리워드앱은 별도): 열정편의점(store)·꼬치왕(skewer)·
 *   홈런팝(homerunpop)·아처리스타즈(archerystars)·Ocean Puzzle(eco01)·
 *   배송대작전(parcelpoprush)·Fish & Go(fishing)·좀비애로우(zombiearrow)·사커플릭(soccerflick)·
 *   베가스호텔타이쿤(socialcasino)·솔리테어(solitaire)·스모클래시(sumoclash, 2026-07-26 추가).
 *   틱택토 네온(tictactoe, 2026-08-05 추가) · 김밥롤 마스터(kimbabroll, 2026-08-07 추가 — prod 는 추가 비번 5656).
 *   양떼고(flockgo)·버블퐁(bubblepong) 은 2026-07-30 준비중으로 전환되어 제외.
 *   추가 오픈은 id 를 더하고, 완전 오픈 시엔 isPlayable 을 true 고정(또는 PLAY_OPEN=true 빌드).
 */
export const PLAY_OPEN_GAMES = new Set<string>(['store', 'skewer', 'homerunpop', 'archerystars', 'eco01', 'parcelpoprush', 'fishing', 'zombiearrow', 'soccerflick', 'socialcasino', 'solitaire', 'sumoclash', 'tictactoe', 'kimbabroll']);

/** 이 게임을 현재 환경에서 실행할 수 있는가.
 *   · '플레이 사이트' 빌드(PLAY_OPEN) 또는 dev → 전체 허용
 *   · 그 외(prod: 브라우저 탭 + 설치형 PWA) → allowlist 든 게임만(PWA 라고 전체 개방하지 않음). */
export function isPlayable(gameId: string): boolean {
  if (PLAY_OPEN || import.meta.env?.DEV) return true;
  return PLAY_OPEN_GAMES.has(gameId);
}

let pollTimer = 0;

/** 마지막으로 실행한 게임 id(없으면 null). */
export function getLastPlayed(): string | null {
  try {
    return localStorage.getItem(LAST_PLAYED_KEY);
  } catch {
    return null;
  }
}

function saveLastPlayed(id: string): void {
  try {
    localStorage.setItem(LAST_PLAYED_KEY, id);
  } catch {
    /* 저장 불가(프라이빗 모드 등) — 무시 */
  }
}

/** 홈 화면에 설치된 PWA(주소창 없는 standalone)에서 실행 중인지. */
function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** 데스크탑 팝업 창 크기/위치 — 내부 영역을 9:16 근사로 맞춘다(기존 grid 로직 계승). */
function popupFeatures(): string {
  let innerH = Math.min(900, Math.round(window.screen.availHeight * 0.86));
  let w = Math.round(innerH * GAME_ASPECT * 0.97);
  const maxW = Math.round(window.screen.availWidth * 0.96);
  if (w > maxW) {
    w = maxW;
    innerH = Math.round(w / GAME_ASPECT);
  }
  const h = innerH + CHROME_H;
  const left = Math.max(0, Math.round((window.screen.availWidth - w) / 2));
  const top = Math.max(0, Math.round((window.screen.availHeight - h) / 2));
  return `popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=no`;
}

/** 게임 URL 에 ?portal=<hubOrigin> 부착 — 게임이 인게임 START 게이트를 띄우는 신호. */
function portalUrl(base: string): string {
  const sep = base.includes('?') ? '&' : '?';
  let url = `${base}${sep}${PORTAL_PARAM}=${encodeURIComponent(window.location.origin)}`;
  // dev: 같은 이름의 팝업은 재사용되며 URL 이 같으면 새로고침되지 않아 옛 화면이 남는다.
  //   매 실행 고유 파라미터를 붙여 재사용 창도 항상 최신 코드로 리로드한다(?portal 파싱엔 무영향).
  if (import.meta.env?.DEV) url += `&_r=${Date.now()}`;
  return url;
}

/**
 * 게임 실행 — 성공 시 true. 전 플랫폼(PC·모바일·dev) **'같은 창 이동(모바일 방식)'** 으로 통일 → 별도 팝업 없음.
 * (_onClose 는 옛 팝업 방식의 창 닫힘 콜백 — 같은 창 이동에선 페이지가 이동하므로 호출되지 않는다.
 *  복귀 시 허브가 새로 로드되어 지갑은 자동 갱신. 호출부 호환을 위해 시그니처만 유지.)
 */
export function launchGame(game: GameEntry, _onClose?: () => void): boolean {
  if (!isPlayable(game.id)) return false; // allowlist 밖은 실행 차단(안내 토스트는 호출부 grid/featured 에서)
  const base = gameUrl(game);
  if (!base) return false;
  const url = portalUrl(base);
  saveLastPlayed(game.id); // 상단 '최근 플레이' 배너 갱신용

  // dev: 게임 dev 서버가 아직 안 떠 있을 수 있다. 허브의 '부팅 페이지'를 먼저 열어 그 안에서
  //   해당 게임 서버를 온디맨드 기동(/__dev/start)한 뒤 실제 게임 URL 로 이동시킨다.
  //   운영(prod)에선 정적 배포라 서버 개념이 없으므로 게임 URL 로 곧장 이동한다.
  const target = import.meta.env?.DEV
    ? `/__dev/boot?game=${encodeURIComponent(game.id)}&to=${encodeURIComponent(url)}`
    : url;

  // ── 실행 방식 통일(2026-07-03) ──
  // PC·모바일·dev 공통으로 **같은 창 이동(모바일 방식)** — 별도 팝업창 없이 허브 화면에서 게임으로
  //   전환한다. 게임이 탭 전체를 채워 자연스럽게 전체화면(팝업+풀스크린 미전환 불일치 제거).
  //   · prod: target = 게임 URL(형제 배포). 복귀 = 게임 내 '허브로 가기' → ../hub/.
  //   · dev : target = /__dev/boot(온디맨드 부팅 화면, location.replace 로 게임 이동). 게임은 각자
  //           포트라 복귀는 '허브로 가기' 버튼이 ?portal= 의 허브 origin 으로 되돌린다(hubButton).
  window.location.assign(target);
  return true;
}

/**
 * 외부 앱 실행 — 게임이 아닌 외부 호스팅 웹앱(예: 미션 리워드 앱테크)을 연다.
 *   게임 팝업과 같은 9:16 근사 창으로 열어 포털 크롬과 결을 맞춘다.
 *   외부 출처(별도 도메인)라 게임 핸드오프(portal 파라미터 / allowlist)는 적용하지 않는다.
 *   설치형 PWA 는 같은 창 이동(팝업 차단 회피), 데스크탑은 팝업. 성공 시 true.
 */
export function openExternalApp(url: string, name: string, onClose?: () => void): boolean {
  if (isStandalone()) {
    window.location.assign(url);
    return true;
  }
  const win = window.open(url, name, popupFeatures());
  if (!win) return false;
  win.focus();

  if (pollTimer) window.clearInterval(pollTimer);
  pollTimer = window.setInterval(() => {
    if (win.closed) {
      window.clearInterval(pollTimer);
      pollTimer = 0;
      onClose?.();
    }
  }, 600);
  return true;
}
