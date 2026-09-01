/**
 * lot3Stores.ts — **21~30F 점포 설계표**(PO 2026-08-30 제공). 아트 `up_Slitare_BG_03_NN` 과 1:1.
 *   ⚠️ 2026-08-30 재지시: 이 10층은 **2번 라인(우 내측) 타워의 11~20층**으로 쌓인다(3번 라인은 아트가 다시 온다).
 *   지금은 데이터만 — 간판·점원 대사·이벤트 타겟이 이 라인을 쓰게 되면 여기서 읽는다(숫자를 여기저기 적지 않게).
 */
export interface Lot3Store {
  readonly floor: number; // 21..30
  readonly name: string;
  readonly en: string;
  readonly visual: string;
  readonly elements: string;
  readonly tone: string;
}

export const LOT3_STORES: readonly Lot3Store[] = [
  { floor: 21, name: '레코드 숍', en: 'VINYL SHOP', visual: 'LP판', elements: '원형 레코드 진열대, 턴테이블, 벽면 음반', tone: '버건디 + 크림' },
  { floor: 22, name: '펫 부티크', en: 'PET BOUTIQUE', visual: '강아지·고양이 실루엣', elements: '펫하우스, 장난감, 사료 진열대', tone: '민트 + 코랄' },
  { floor: 23, name: '카메라 숍', en: 'CAMERA SHOP', visual: '대형 카메라', elements: '카메라 진열장, 삼각대, 사진 프레임', tone: '네이비 + 베이지' },
  { floor: 24, name: '스포츠 숍', en: 'SPORTS SHOP', visual: '운동화·공', elements: '운동화 벽면, 공, 스포츠 백', tone: '블루 + 오렌지' },
  { floor: 25, name: '초콜릿 숍', en: 'CHOCOLATIER', visual: '초콜릿 박스', elements: '유리 쇼케이스, 초콜릿 피라미드, 선물상자', tone: '브라운 + 골드' },
  { floor: 26, name: '향수 부티크', en: 'PERFUMERY', visual: '향수병', elements: '유리 선반, 향수병, 작은 꽃장식', tone: '라벤더 + 골드' },
  { floor: 27, name: '시계 전문점', en: 'WATCH SHOP', visual: '대형 손목시계', elements: '시계 진열 케이스, 벽시계, 정밀 작업대', tone: '딥그린 + 브라스' },
  { floor: 28, name: '주얼리 숍', en: 'JEWELRY', visual: '다이아몬드', elements: '목걸이·반지 쇼케이스, 벨벳 진열대', tone: '아이보리 + 골드' },
  { floor: 29, name: '인테리어 숍', en: 'INTERIOR STUDIO', visual: '의자·램프', elements: '디자인 체어, 조명, 작은 소파, 화분', tone: '테라코타 + 크림' },
  { floor: 30, name: '와인 & 고메 숍', en: 'GOURMET CELLAR', visual: '병 + 바스켓', elements: '병 진열벽, 치즈·고메 상품, 목재 선반', tone: '와인레드 + 다크우드' },
];

/** 21~30층 → 표 행(범위 밖이면 undefined). */
export function lot3StoreOf(floor: number): Lot3Store | undefined {
  return LOT3_STORES.find((s) => s.floor === Math.floor(floor));
}
