/**
 * autoTest.ts — 게임 내 자동 시뮬레이션(배속 자동플레이) 상태 + 데이터 수집(dev 전용 QA 도구).
 *   PlayScene 은 레벨 전환마다 씬을 재시작(create() 재호출로 클래스 필드가 리셋)하므로,
 *   토글 상태·누적 데이터는 반드시 클래스 필드가 아닌 이 **모듈 스코프**에 둬야 레벨을 넘어가도 살아남는다.
 */

export interface LevelTestResult {
  level: number;
  win: boolean;
  leftoverStock: number;
  moves: number;
  maxCombo: number;
  comboRuns: number[];
  drawCount: number;
  ts: number;
}

export interface AutoTestState {
  running: boolean;
  autoAdvance: boolean;
  results: LevelTestResult[];
  /** 좌상단 QA 버튼 묶음(자동테스트/자동넘김/내보내기) 표시 여부 — 메뉴의 토글로 켜고 끔. 기본값=꺼짐(일반 플레이 화면 방해 안 하게). */
  uiVisible: boolean;
}

export const autoTestState: AutoTestState = {
  running: false,
  autoAdvance: false,
  results: [],
  uiVisible: false,
};

export function recordAutoTestResult(r: LevelTestResult): void {
  autoTestState.results.push(r);
}

/** 수집한 레벨별 결과를 JSON 파일로 내려받는다(브라우저 Blob 다운로드). */
export function exportAutoTestData(): void {
  const blob = new Blob([JSON.stringify(autoTestState.results, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `solitaire-autotest-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
