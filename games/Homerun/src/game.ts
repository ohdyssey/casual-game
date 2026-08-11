import type { GameModule } from '@casual/core';
import { makePortalLoading } from '@casual/core';
import { LobbyScene } from './scenes/LobbyScene.js';
import { PlayScene } from './scenes/PlayScene.js';
import { loadGameAssets, ensureGeneratedTextures, preloadKoreanFonts, preloadCharacterClips } from './assets.js';
import { preloadRealSfx } from './audio.js';

/**
 * 홈런팝 GameModule — Boot→Load→Play(타이밍 타격 본편).
 * 홈런 클래시 스타일: 투구→히팅존 터치→판정→타구 방향 카메라 줌인.
 */
export const HomerunGame: GameModule = {
  id: 'homerun',
  title: '홈런팝',
  scenes: [
    ...makePortalLoading({
      startScene: 'lobby',
      // 로비 화면이 자체 START 버튼을 가지므로 로딩 화면 자체엔 버튼을 띄우지 않고 바로 로비로 진입.
      autoAdvance: true,
      barColor: 0x1e88e5,
      // 로딩바를 화면 하단에서 위로 올려 배치. H=2400 기준(1580→1780→1930, 아래로 200+150pt).
      barY: 1930,
      // 두께(세로) 3배(26→78). 길이(가로)는 580→406(30% 축소) 이후 다시 조금 늘림.
      barHeight: 78,
      barWidth: 460,
      // 진행률 %는 바 중앙에 겹쳐서 볼드체로 크게.
      barPctPosition: 'center',
      barPctFontSize: 52,
      barPctBold: true,
      preload: (s) => loadGameAssets(s),
      onLoaded: async (s) => {
        ensureGeneratedTextures(s);
        // 폰트·캐릭터 클립 아틀라스·효과음 샘플을 로딩 화면에서 함께 선로딩(서로 독립 → 병렬).
        // 클립 선로딩이 "첫 접속엔 캐릭터 애니 미표시" 증상을 해소한다(assets.ts 참조).
        await Promise.all([preloadKoreanFonts(), preloadCharacterClips(s), preloadRealSfx()]);
      },
    }),
    LobbyScene,
    PlayScene,
  ],
  backgroundColor: '#1565C0',
  // UI 에디터 디자인(1080×2400 세로 HD) 기반 + 가변 높이(정통 모바일 세로 게임 방식).
  // 폭은 디자인과 1:1 고정(1080), 높이는 부팅 시점 화면비로 1920~2400 사이에서 산출 —
  // 캔버스 비율이 화면 비율과 일치해 FIT 레터박스(좌우·하단 여백)가 사라진다(사용자 보고:
  // 아이폰 "좌우여백이 남거나 하단 여백" — 20:9 디자인을 19.5:9 뷰포트에 FIT 하면 필연).
  // 높이가 2400 이 아닐 때의 배치는 pin 앵커(layoutLoader.anchorLayoutDoc)가 흡수한다:
  // 상단 HUD=top 고정 · 필드/캐릭터/하단 UI=bottom 고정 · 중앙 팝업=center.
  designWidth: 1080,
  // 세로 하한 2200 = **세이프존 높이**(저작 2400 중 최대 200px = 8% 만 잘린다).
  // ⚠️ 이 값이 "답답함"을 직접 좌우한다: 하한이 낮을수록 필드 세로가 잘려 타자와 펜스 사이
  // 여백이 사라진다(사용자 보고 — 1920 일 때 480px=20% 손실). 올리면 세로가 살아나는 대신
  // 아래 designWidthRange 로 흡수해야 할 가로 폭이 커지고, 세이프존이 화면에서 차지하는
  // 비율이 줄어 UI 가 조금 작아 보인다. 1920→2200 은 그 균형점(사용자 선택 B안).
  designHeightRange: { min: 2200, max: 2400 },
  // 양축 가변(표준) — 세로 하한에 닿을 만큼 넓은 박스에선 세로를 더 깎는 대신 폭을 늘린다.
  // 이 구간은 태블릿/데스크톱만이 아니다: 하단 배너 슬롯(96+홈바)을 뺀 컨테이너 비율이
  // 세이프존 비율(2200/1080≈2.04)보다 넓어지는 **거의 모든 폰**이 여기 해당한다
  // (iPhone 15 → 컨테이너 393×722, r=1.84 / iPhone SE → 375×571, r=1.52).
  // 폭 고정이면 좌우에 검은 필러박스가 남았다(사용자 보고 "좌우 여백"의 실제 원인).
  // 상한 1600 = 가장 넓은 폰 컨테이너(SE, r=1.52 → 2200/1.52≈1447)까지 여유 있게 커버.
  // 배경(2415px)이 이미 좌우 블리드를 갖고 있어 폭이 늘어도 빈 띠가 생기지 않는다.
  // 넓어진 폭은 레이아웃 세이프존 중앙정렬로 흡수한다(layoutAnchor.anchorLayoutDoc — pinX 기본 center).
  designWidthRange: { min: 1080, max: 1600 },
  theme: { brand: '#1E88E5' },
  hud: { combo: true },
  liveops: { shop: true, daily: true },
  powerups: ['fireball', 'precision', 'lightning'],
};
