/**
 * 저작 노드 렌더 헬퍼 — **에디터 rect 를 Phaser 오브젝트로 옮기는 단 하나의 규약.**
 *
 * 왜 필요한가: `img()` / `txt()` / `hit()` 세 헬퍼가 로비·결과·상단헤더·리그·샵·모드선택·
 * PVP 매칭에 **각각 다시 구현**돼 있었다(7벌). 그래서 앵커 대응 같은 공통 변경이 생길 때마다
 * 7곳을 따로 고쳐야 했고, 아이템샵의 배율 버그(`캔버스폭/720`)처럼 한 벌에만 있는 실수가 났다.
 *
 * ## 규약 (전 게임 공통 함정을 여기서 한 번에 처리한다)
 * · **rect 는 좌상단 기준** — 이미지는 중심에 놓고 `setDisplaySize` 로 저작 크기를 맞춘다.
 * · **텍스트 x 는 align 에 따라 기준점이 다르다** — left=왼쪽 끝, right=오른쪽 끝, center=중앙.
 *   로더가 전부 origin 0.5 를 쓰면 좌측정렬 텍스트가 반폭만큼 밀린다(전 SSOT 게임 공통).
 * · **히트영역은 아트가 아니라 투명 사각형** — 아트를 직접 interactive 로 만들면 눌림 연출이
 *   아트를 흔든다. 빈 문자열 텍스트에 `setInteractive` 를 걸면 히트영역이 굳는 버그도 피한다.
 * · 자식은 **add 순서대로 그려진다**(컨테이너는 depth 자동정렬을 하지 않는다) — 호출 순서 = 저작 z 순서.
 *
 * ## 좌표 매핑
 * 저작 프레임이 세이프존과 다른 화면(아이템샵 720×1600)은 `scale` 로 배수를, 캔버스가 넓어진
 * 만큼은 `offX/offY` 로 중앙정렬을 준다. ⚠️ 배수는 **세이프존 기준**이어야 한다 — 캔버스 폭으로
 * 나누면 폭이 넓은 기기에서 팝업이 화면 밖으로 나간다.
 */
import Phaser from 'phaser';
import { fitText } from './fitText.js';
import { FONT } from './uiKit.js';
import { BODY_WEIGHT } from '../logic/textFit.js';

/** 저작 노드 사각형(좌상단 기준). */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** 저작 텍스트 스타일 — 에디터가 주는 값 그대로. */
export interface AuthoredTextStyle {
  size: number;
  color: string;
  /** 저작 정렬. 기본 center. */
  align?: 'left' | 'center' | 'right';
  /** 굵기. 기본은 본문 굵기(700). 제목은 TITLE_WEIGHT(800). */
  weight?: string;
  stroke?: string;
  strokeW?: number;
  shadow?: boolean;
}

export interface AuthoredOpts {
  /** 저작 프레임 → 세이프존 배수(기본 1). 아이템샵처럼 저작 폭이 다를 때만 준다. */
  readonly scale?: number;
  /** 캔버스가 넓어진 만큼의 가로 이동(중앙정렬). */
  readonly offX?: number;
  /** 캔버스가 길어진 만큼의 세로 이동. */
  readonly offY?: number;
}

export interface AuthoredNodes {
  /** 저작 rect → 캔버스 rect(배수·오프셋 적용). */
  rect(r: Rect): Rect;
  /** 저작 rect 에 이미지 — 중심 배치 + 저작 표시 크기. */
  img(r: Rect, key: string, parent?: Phaser.GameObjects.Container): Phaser.GameObjects.Image;
  /** 저작 텍스트 — align 기준점·외곽선·그림자를 저작값대로. */
  txt(r: Rect, value: string, s: AuthoredTextStyle, parent?: Phaser.GameObjects.Container): Phaser.GameObjects.Text;
  /** 슬롯 폭에 맞춰 **가장 큰 크기**로 넣는 텍스트(모바일 가독성 우선). */
  fitTxt(r: Rect, value: string, s: AuthoredTextStyle, parent?: Phaser.GameObjects.Container): Phaser.GameObjects.Text;
  /** 저작 rect 위 투명 히트영역. pad 로 터치 영역만 넓힐 수 있다. */
  hit(r: Rect, onTap: () => void, pad?: number, parent?: Phaser.GameObjects.Container): Phaser.GameObjects.Rectangle;
}

/**
 * 저작 노드 렌더러를 만든다. 만들어진 오브젝트는 모두 `root` 에 add 된다
 * (개별 호출에서 `parent` 를 주면 그쪽으로).
 */
export function authoredNodes(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  opts: AuthoredOpts = {},
): AuthoredNodes {
  const f = opts.scale ?? 1;
  const ox = opts.offX ?? 0;
  const oy = opts.offY ?? 0;
  const rect = (r: Rect): Rect => ({ x: r.x * f + ox, y: r.y * f + oy, w: r.w * f, h: r.h * f });
  const put = <T extends Phaser.GameObjects.GameObject>(o: T, parent?: Phaser.GameObjects.Container): T => {
    (parent ?? root).add(o);
    return o;
  };

  const img: AuthoredNodes['img'] = (r, key, parent) => {
    const q = rect(r);
    return put(scene.add.image(q.x + q.w / 2, q.y + q.h / 2, key).setDisplaySize(q.w, q.h), parent);
  };

  /** align 에 따른 앵커 x 와 origin — 전 SSOT 게임 공통 함정. */
  const anchorX = (q: Rect, align: AuthoredTextStyle['align']): { x: number; originX: number } =>
    align === 'left'
      ? { x: q.x, originX: 0 }
      : align === 'right'
        ? { x: q.x + q.w, originX: 1 }
        : { x: q.x + q.w / 2, originX: 0.5 };

  const decorate = (t: Phaser.GameObjects.Text, s: AuthoredTextStyle): Phaser.GameObjects.Text => {
    if (s.strokeW) t.setStroke(s.stroke ?? '#3a2410', Math.round(s.strokeW * f));
    // 저작 그림자 — 오프셋 2,2 / 블러 2 / 검정 40%(Phaser 는 rgba 문자열을 받는다).
    if (s.shadow) t.setShadow(2, 2, 'rgba(0,0,0,0.4)', 2, false, true);
    /**
     * 이탤릭 보정 — **오른쪽 위가 잘리는** 문제(2026-08-15 사용자 리포트).
     *
     * 기울어진 글리프와 두꺼운 외곽선은 측정폭(measureText 의 advance) 밖으로 삐져나가는데
     * Phaser 는 그만큼 캔버스를 넓히지 않는다. 그래서 오른쪽 모서리가 잘린다.
     *
     * ⚠️ **패딩은 반드시 좌우 대칭이어야 한다.** 한쪽에만 주면 캔버스만 그쪽으로 넓어지고
     *   잉크는 제자리라, origin 0.5 기준으로 글자가 **반대쪽으로 패딩의 절반만큼 밀린다.**
     *   실측(Chromium, 700 italic 60px, 이 게임 폰트 스택): 오른쪽에만 12px 을 줬더니
     *   잉크 중심이 캔버스 중심보다 **3.0~3.5px 왼쪽**에 놓였다 — 단계 번호가 별 명패에서
     *   왼쪽으로 치우쳐 보이던 원인이다(사용자 리포트 2회).
     *   같은 실측에서 이 폰트는 60px 에서 advance 밖 오버행이 사실상 없었다(잉크 [0,31]/advance 31.1).
     *   즉 필요한 것은 **잘림 방지 여백**이지 한쪽 보정이 아니다.
     */
    if ((s.weight ?? '').includes('italic')) {
      const pad = Math.ceil(Math.round(s.size * f) * 0.2);
      t.setPadding(pad, 0, pad, 0);
    }
    return t;
  };

  const txt: AuthoredNodes['txt'] = (r, value, s, parent) => {
    const q = rect(r);
    const a = anchorX(q, s.align);
    const t = scene.add
      .text(a.x, q.y + q.h / 2, value, {
        fontFamily: FONT,
        fontSize: `${Math.round(s.size * f)}px`,
        color: s.color,
        fontStyle: s.weight ?? BODY_WEIGHT,
      })
      .setOrigin(a.originX, 0.5);
    return put(decorate(t, s), parent);
  };

  const fitTxt: AuthoredNodes['fitTxt'] = (r, value, s, parent) => {
    const q = rect(r);
    const t = fitText(scene, q, value, {
      size: Math.round(s.size * f),
      color: s.color,
      align: s.align ?? 'center',
      weight: s.weight,
      strokeColor: s.stroke,
      strokeW: s.strokeW ? Math.round(s.strokeW * f) : undefined,
      shadow: s.shadow,
    });
    return put(t, parent);
  };

  const hit: AuthoredNodes['hit'] = (r, onTap, pad = 0, parent) => {
    const q = rect(r);
    const h = scene.add
      .rectangle(q.x + q.w / 2, q.y + q.h / 2, q.w + pad * f, q.h + pad * f, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    h.on('pointerdown', onTap);
    return put(h, parent);
  };

  return { rect, img, txt, fitTxt, hit };
}
