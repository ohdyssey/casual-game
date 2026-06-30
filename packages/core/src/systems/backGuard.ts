/**
 * Back-guard — 모바일 뒤로가기 제스처(갤럭시 엣지 스와이프 / 안드로이드 ← 버튼)로
 * 게임이 의도치 않게 언로드되는 것을 막는다.
 *
 * 핵심: OS 제스처 자체는 웹에서 끌 수 없다. 하지만 그 제스처가 일으키는 history
 * "뒤로가기"는 가로챌 수 있다. history.pushState 로 더미 항목을 깔아두고 popstate
 * (뒤로가기 발생) 시 즉시 다시 push → 페이지는 절대 언로드되지 않는다. 대신
 * "나가시겠어요?" 확인창을 띄워 사용자가 의도적으로만 나가게 한다(조용히 흡수하면
 * '갇힌' 느낌이 들 수 있어 명시적 탈출구를 둔다).
 *
 * 한계(정직하게): 홈 버튼·앱 스위처·탭 닫기 등 "뒤로가기가 아닌" 이탈은 막지 못한다.
 *
 * Phaser-free(DOM 전용) → 허브·게임 양쪽에서 동일하게 import 한다.
 */

import { COLORS, FONT, MIN_TOUCH } from '../tokens.js';

export interface BackGuardOptions {
  /**
   * true 면 뒤로가기를 **조용히 흡수**한다 — 확인창 없이 그냥 게임에 머문다(아무 동작 안 함).
   * false(기본) 면 "나가시겠어요?" 확인창을 띄워 의도적 이탈을 허용한다.
   * silent 모드에선 뒤로가기로 게임을 절대 못 나가므로, 게임 내 홈/나가기 버튼이 별도로 필요하다.
   */
  silent?: boolean;
  /** 확인창 제목. */
  title?: string;
  /** 확인창 본문. */
  message?: string;
  /** 나가기(이탈) 버튼 라벨. */
  confirmText?: string;
  /** 계속하기(머무르기) 버튼 라벨. */
  cancelText?: string;
  /**
   * "나가기" 확정 시 동작. 미지정 시 기본:
   *  1) 허브 팝업으로 열렸으면 window.close() 로 허브 복귀,
   *  2) 실제 이전 페이지가 있으면 거기로(history.go(-2)),
   *  3) 첫 진입(갈 곳 없음)이면 그대로 머무름.
   */
  onExit?: () => void;
  /** 확인창이 열릴 때(예: 게임 일시정지). */
  onPromptOpen?: () => void;
  /** 확인창이 닫힐 때(예: 게임 재개). */
  onPromptClose?: () => void;
}

/** popstate 가 우리가 깐 항목인지 식별하기 위한 마커. */
const GUARD_MARKER = { __casualBackGuard__: true } as const;

/**
 * 뒤로가기 가드를 설치한다. 반환 함수를 호출하면 해제한다.
 * SSR/구형 환경에서는 no-op 을 반환한다.
 */
export function installBackGuard(opts: BackGuardOptions = {}): () => void {
  if (typeof window === 'undefined' || typeof history === 'undefined') {
    return () => {};
  }

  const text = {
    title: opts.title ?? '게임을 나가시겠어요?',
    message: opts.message ?? '진행 중인 내용이 사라질 수 있어요.',
    confirm: opts.confirmText ?? '나가기',
    cancel: opts.cancelText ?? '계속하기',
  };

  const silent = opts.silent ?? false;
  let promptOpen = false;
  let disposed = false;

  const anchor = () => {
    try {
      history.pushState(GUARD_MARKER, '');
    } catch {
      /* sandbox / 권한 제한 — 가드 불가, 조용히 무시 */
    }
  };

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener('popstate', onPop);
  };

  const doExit = () => {
    cleanup();
    if (opts.onExit) {
      opts.onExit();
      return;
    }
    // 1) 허브가 띄운 팝업이면 닫아서 허브로 복귀.
    const opener = window.opener as Window | null;
    if (opener && !opener.closed) {
      window.close();
      return;
    }
    // 2) 설치 anchor + 재anchor 를 건너뛰어 실제 이전 페이지로. 첫 진입이면 멈춤(허용).
    try {
      history.go(-2);
    } catch {
      /* 갈 곳 없음 — 머무름 */
    }
  };

  function onPop() {
    if (disposed) return;
    // 뒤로가기로 guard 항목이 pop 됨 → 즉시 재anchor 해서 페이지 유지(언로드 방지).
    anchor();
    if (silent) return; // 조용히 흡수 — 확인창 없이 게임 유지(아무 동작 안 함).
    if (promptOpen) return; // 확인창이 떠 있는 동안 추가 뒤로가기는 흡수만.
    promptOpen = true;
    opts.onPromptOpen?.();
    showConfirmDialog(text).then((leave) => {
      promptOpen = false;
      opts.onPromptClose?.();
      if (leave) doExit();
    });
  }

  anchor();
  window.addEventListener('popstate', onPop);
  return cleanup;
}

interface DialogText {
  title: string;
  message: string;
  confirm: string;
  cancel: string;
}

/** 브랜드 톤의 모달 확인창(DOM). true=나가기, false=계속. 한 번에 하나만 보장은 호출측 책임. */
function showConfirmDialog(text: DialogText): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', text.title);
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483646',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom))',
      background: 'rgba(10, 37, 64, 0.55)',
      backdropFilter: 'blur(2px)',
      WebkitBackdropFilter: 'blur(2px)',
      font: `400 16px ${FONT.family}`,
      touchAction: 'manipulation',
    } as Partial<CSSStyleDeclaration>);

    const card = document.createElement('div');
    Object.assign(card.style, {
      width: 'min(360px, 86vw)',
      background: COLORS.hudCapsule,
      borderRadius: '20px',
      padding: '24px 22px',
      boxShadow: '0 18px 48px rgba(10, 37, 64, 0.35)',
      textAlign: 'center',
      color: COLORS.hudText,
    } as Partial<CSSStyleDeclaration>);

    const title = document.createElement('div');
    title.textContent = text.title;
    Object.assign(title.style, {
      fontSize: '22px',
      fontWeight: '700',
      marginBottom: '8px',
    } as Partial<CSSStyleDeclaration>);

    const message = document.createElement('div');
    message.textContent = text.message;
    Object.assign(message.style, {
      fontSize: '15px',
      lineHeight: '1.5',
      color: '#5A6B7B',
      marginBottom: '22px',
    } as Partial<CSSStyleDeclaration>);

    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      gap: '10px',
    } as Partial<CSSStyleDeclaration>);

    const baseBtn = (label: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      Object.assign(b.style, {
        flex: '1',
        minHeight: `${MIN_TOUCH}px`,
        padding: '12px 8px',
        borderRadius: '12px',
        fontSize: '17px',
        fontWeight: '700',
        fontFamily: FONT.family,
        cursor: 'pointer',
        border: 'none',
        touchAction: 'manipulation',
      } as Partial<CSSStyleDeclaration>);
      return b;
    };

    // 나가기(이탈) — 위험도 낮춰 보조 스타일(테두리/회색).
    const exitBtn = baseBtn(text.confirm);
    Object.assign(exitBtn.style, {
      background: '#FFFFFF',
      color: '#5A6B7B',
      border: '2px solid #D7DEE5',
    } as Partial<CSSStyleDeclaration>);

    // 계속하기(머무르기) — 주동작, 기본 포커스.
    const stayBtn = baseBtn(text.cancel);
    Object.assign(stayBtn.style, {
      background: COLORS.brandGreen,
      color: COLORS.textWhite,
    } as Partial<CSSStyleDeclaration>);

    let settled = false;
    const close = (leave: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(leave);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(false);
    };

    exitBtn.addEventListener('click', () => close(true));
    stayBtn.addEventListener('click', () => close(false));
    // 배경 탭 = 계속하기(실수 이탈 방지).
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    window.addEventListener('keydown', onKey);

    row.append(exitBtn, stayBtn);
    card.append(title, message, row);
    overlay.append(card);
    document.body.append(overlay);
    stayBtn.focus();
  });
}
