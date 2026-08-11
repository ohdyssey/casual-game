/**
 * 앱인토스 미니앱 빌드 설정 — `ait build` 가 이 파일을 읽어 web.commands.build 를 실행한 뒤
 * outdir 을 .ait 아티팩트로 포장한다. `ait deploy` 로 업로드.
 *
 * ⚠️ appName 은 개발자센터 콘솔에 등록한 이름과 **정확히 일치**해야 한다.
 * ⚠️ brand.icon 은 콘솔에 아이콘을 업로드한 뒤 받은 URL 을 넣는다(빈 값이면 기본 아이콘).
 */
import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'homerun-pop', // TODO: 콘솔 등록명으로 교체
  brand: {
    displayName: '홈런팝',
    primaryColor: '#0A2540', // 게임 UI 네이비(에디터 SSOT 기준)
    icon: '', // TODO: 콘솔 업로드 후 URL 기입
  },
  // 카메라·연락처·위치 등 네이티브 권한을 쓰지 않는다(광고·결제는 권한 대상이 아님).
  permissions: [],
  web: {
    host: 'localhost',
    port: 6197,
    // ⚠️ 여러 명령을 `&&` 로 잇지 말 것 — ait CLI 가 명령을 인자 배열로 쪼개 `"&&"` 를 리터럴로
    //    넘기는 바람에 체인이 깨진다. package.json 스크립트 하나로 묶어서 넘긴다.
    //    build:toss = 폰트 정합성 검사 → vite build → 에셋 경량화(100MB 한도 대응).
    commands: { dev: 'vite', build: 'npm run build:toss' },
  },
  /**
   * 게임용 웹뷰 옵션 — 캔버스 전체가 조작면이라 브라우저 기본 제스처가 전부 오작동 원인이 된다.
   * 특히 pullToRefreshEnabled:false 가 없으면 타격 중 아래로 스와이프가 새로고침으로 먹혀
   * 경기가 통째로 날아간다.
   */
  webViewProps: {
    bounces: false, // iOS 고무줄 스크롤
    pullToRefreshEnabled: false, // 당겨서 새로고침(경기 유실 방지)
    overScrollMode: 'never', // 안드로이드 오버스크롤 글로우
    allowsBackForwardNavigationGestures: false, // 엣지 스와이프 뒤로가기 이탈
    mediaPlaybackRequiresUserAction: false, // BGM/효과음 자동재생 허용
    allowsInlineMediaPlayback: true,
  },
  outdir: 'dist',
});
