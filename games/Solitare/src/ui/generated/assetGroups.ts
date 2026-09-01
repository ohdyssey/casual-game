/**
 * assetGroups.ts — **생성물이다. 직접 고치지 말 것** (`npm run gen:asset-groups`).
 *
 * 화면 단위 에셋 그룹. 부팅에는 안 올리고 `ui/assetBudget.ts` 가 미리 받아 두거나 예산에 따라 내린다.
 * 생성 규칙·근거는 scripts/gen-asset-groups.mjs 머리말 참고.
 */

/** 그룹 이름. */
export type AssetGroup = 'office' | 'bank' | 'lot2' | 'lot3';

/** 그룹 → 텍스처 키 + **원본 기준 최대 텍스처 바이트**(배포본은 다이어트로 더 작다 = 상한). */
export const ASSET_GROUPS: Readonly<Record<AssetGroup, { readonly keys: readonly string[]; readonly maxBytes: number }>> = {
  office: {
    keys: [
      'up_Slitare_Office_01',
      'up_Slitare_Office_02',
      'up_Slitare_Office_03',
      'up_Slitare_Office_04',
      'up_Slitare_Office_05',
      'up_Solirare_Officer_01',
      'up_Solirare_Officer_02',
      'up_Solirare_Officer_03',
      'up_Solirare_Officer_04',
      'up_Solirare_Officer_05',
    ],
    maxBytes: 8181312,
  },
  bank: {
    keys: [
      'up_Bank_01',
      'up_Bank_02',
      'up_Bank_03',
      'up_Bank_04',
      'up_Solirare_Bank_01',
      'up_Solirare_Bank_02',
      'up_Solirare_Bank_03',
      'up_Solirare_Bank_04',
    ],
    maxBytes: 6563184,
  },
  lot2: {
    keys: [
      'up_Slitare_BG_02_01',
      'up_Slitare_BG_02_02',
      'up_Slitare_BG_02_03',
      'up_Slitare_BG_02_04',
      'up_Slitare_BG_02_05',
      'up_Slitare_BG_02_06',
      'up_Slitare_BG_02_07',
      'up_Slitare_BG_02_08',
      'up_Slitare_BG_02_09',
      'up_Slitare_BG_02_10',
      'up_Slitare_BG_03_01',
      'up_Slitare_BG_03_02',
      'up_Slitare_BG_03_03',
      'up_Slitare_BG_03_04',
      'up_Slitare_BG_03_05',
      'up_Slitare_BG_03_06',
      'up_Slitare_BG_03_07',
      'up_Slitare_BG_03_08',
      'up_Slitare_BG_03_09',
      'up_Slitare_BG_03_10',
      'up_Solirare_Chr_02_01',
      'up_Solirare_Chr_02_02',
      'up_Solirare_Chr_02_03',
      'up_Solirare_Chr_02_04',
      'up_Solirare_Chr_02_05',
      'up_Solirare_Chr_02_06',
      'up_Solirare_Chr_02_07',
      'up_Solirare_Chr_02_08',
      'up_Solirare_Chr_02_09',
      'up_Solirare_Chr_02_10',
      'up_Solirare_Chr_03_01',
      'up_Solirare_Chr_03_02',
      'up_Solirare_Chr_03_03',
      'up_Solirare_Chr_03_04',
      'up_Solirare_Chr_03_05',
      'up_Solirare_Chr_03_06',
      'up_Solirare_Chr_03_07',
      'up_Solirare_Chr_03_08',
      'up_Solirare_Chr_03_09',
      'up_Solirare_Chr_03_10',
    ],
    maxBytes: 34258496,
  },
  lot3: {
    keys: [
      'up_Slitare_BG_04_01',
      'up_Slitare_BG_04_02',
      'up_Slitare_BG_04_03',
      'up_Slitare_BG_04_04',
      'up_Slitare_BG_04_05',
      'up_Slitare_BG_04_06',
      'up_Slitare_BG_04_07',
      'up_Slitare_BG_04_08',
      'up_Slitare_BG_04_09',
      'up_Slitare_BG_04_10',
      'up_Slitare_BG_04_11',
      'up_Slitare_BG_04_12',
      'up_Slitare_BG_04_13',
      'up_Slitare_BG_04_14',
      'up_Slitare_BG_04_15',
      'up_Solirare_Chr_04_01',
      'up_Solirare_Chr_04_02',
      'up_Solirare_Chr_04_03',
      'up_Solirare_Chr_04_04',
      'up_Solirare_Chr_04_05',
      'up_Solirare_Chr_04_06',
      'up_Solirare_Chr_04_07',
      'up_Solirare_Chr_04_08',
      'up_Solirare_Chr_04_09',
      'up_Solirare_Chr_04_10',
      'up_Solirare_Chr_04_11',
      'up_Solirare_Chr_04_12',
      'up_Solirare_Chr_04_13',
      'up_Solirare_Chr_04_14',
      'up_Solirare_Chr_04_15',
    ],
    maxBytes: 26396160,
  },
};

/** 부팅 매니페스트에서 빼야 할 키 전체(그룹 합집합). */
export const GROUPED_KEYS: ReadonlySet<string> = new Set(Object.values(ASSET_GROUPS).flatMap((g) => g.keys));
