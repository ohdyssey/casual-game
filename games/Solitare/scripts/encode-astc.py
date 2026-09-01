"""
encode-astc.py — **배포 조립본의 업로드 이미지를 ASTC(KTX)로 굽는다**(2026-08-31, 텍스처 메모리 1/4~1/9).

왜: 디코드 RGBA 는 `가로×세로×4` 라 WebP 로는 메모리가 안 줄었다. ASTC 는 GPU 가 압축된 채로 읽는다.
    실측 샘플(scripts 메모): 층 6×6 SSIM 0.989 · 호텔 0.992 · 손님 4×4 0.997 — 얇은 선·글자는 제외한다.

규칙(유형별 블록 — 화질 게이트 미달이면 한 단계 촘촘한 블록으로 강등, 그래도 미달이면 굽지 않는다):
    · 배경·층·큰 채색 패널 → 6×6 (SSIM ≥ 0.985)
    · 캐릭터·손님(알파 경계) → 4×4 (SSIM ≥ 0.995)
    · 그 외(UI·카드·아이콘·텍스트) → 제외(RGBA 유지)

출력: `<deploy>/ui/uploads/<key>.ktx` (+ `<deploy>/customers/*.ktx`) 와 `<deploy>/ui-assets-astc.json` { key → ktx 경로 }.
    런타임(assets.ts `loadUpload`)은 이 표가 있으면 `load.texture({ ASTC, IMG })` 로 받는다 — 미지원 기기는 IMG(WebP).
사용: python scripts/encode-astc.py --deploy d:/tmp/rl-deploy/solitaire [--quality medium|thorough] [--limit N]
"""
import argparse, io, json, math, os, re, struct, sys, time
import numpy as np
from PIL import Image
from astc_encoder import ASTCConfig, ASTCContext, ASTCImage, ASTCProfile, ASTCSwizzle, ASTCType, ASTCQualityPreset

# ── 분류 규칙 ───────────────────────────────────────────────────────────
BG_RE = re.compile(r'^up_(Slitare_BG_|Solitaire_BG_|Slitare_Office_|Bank_|Slitare_Ruin|Slitare_BG_Back|Store|CollectionCard\d\d_)', re.I)  # 컬렉션 카드(채색화) 6×6 — 63장 97MB→11MB(2026-08-31).
BG_EXTRA = {  # 큰 채색 패널(선·글자가 굵어 6×6 허용) — 실측 목록에서 고른 것.
    'up_CollecttionCard_main', 'up_Solitare_UI_27', 'up_Solitare_UI_29', 'up_Solitare_UI_28', 'up_TopEvent_02', 'up_TopEvent_03',
    'up_CollecttionCard_Frame', 'up_PlayIn_01', 'up_Slitare_BG_Crane', 'up_Slitare_BG_Crane_v6', 'up_Slitare_BG_Crane_v8',
    'up_DailyMission_02-1', 'up_Slitare_Office_roof', 'up_Slitare_BG_roof', 'up_Slitare_BG_roof_v2',
}
CHAR_RE = re.compile(r'^up_(Solirare_Chr_|Solirare_Officer_|Solirare_Bank_)', re.I)
EXCLUDE_RE = re.compile(r'(Glass|_UI_|CARD_|Item_|Imoji|Rewards|Coin|Resurt|LeaderBoard|League|Logo|Loading|Ruin|Destroy|BG_Back)', re.I)  # Ruin: 캔버스로 그려 상단 검출(getSourceImage 필요) → 제외.
# BG_Back(하늘·원경, up_Slitare_BG_Back01-*): 실기기 화면 깨짐 실측(2026-09-01, 가로 줄무늬+대각선) — 매끄러운
#   그라디언트 하늘은 ASTC 블록압축의 대표적 약점(SSIM 게이트는 이 밴딩을 잘 못 잡는다) + 일부 기기 ASTC
#   디코드 호환성까지 겹쳤을 가능성. 홈 화면 진입마다 항상 보이는 자리라 압축 이득보다 위험이 크다 → 제외.

# KTX v1 glInternalFormat (선형 RGBA — Phaser 는 SRGB 변형을 안 받는 기기가 있어 선형으로 통일).
ASTC_FMT = {(4, 4): 0x93B0, (5, 5): 0x93B2, (6, 6): 0x93B4, (8, 8): 0x93B7}
GL_RGBA = 0x1908


# ⚠️ ASTC 전체 비활성화(2026-09-01) — 실기기 실측: 하늘/원경만 제외했더니 **타워 층·건물 등 다른 ASTC
#   텍스처에서도 같은 줄무늬/깨짐**이 재현됐다. 특정 이미지의 그라디언트 밴딩이 아니라 그 기기의 GPU가
#   ASTC 디코드 자체를 제대로 못 하는 것으로 보인다 — 개별 이미지를 하나씩 빼는 방식으로는 못 잡는다.
#   기기별 호환성 매트릭스를 제대로 검증하기 전까지는 전부 RGBA(WebP)로 되돌린다(diet-assets 다이어트는
#   그대로 유효 — 부팅 상주는 ASTC 이전 실측치인 ~156MB 로 돌아갈 뿐, 예산 한도 220MB 안쪽).
ASTC_DISABLED = True

def classify(key: str):
    if ASTC_DISABLED: return None
    if key in BG_EXTRA: return 'bg'
    if EXCLUDE_RE.search(key) and key not in BG_EXTRA: return None
    if CHAR_RE.match(key): return 'char'
    if BG_RE.match(key): return 'bg'
    return None

RULES = {
    'bg':   {'blocks': [(6, 6), (4, 4)], 'ssim': 0.985},
    'char': {'blocks': [(4, 4)], 'ssim': 0.990},  # 4포즈 시트는 얼굴이 작아 0.993~0.995 — 육안 동일(샘플 0.997)이라 0.99.
}

def gray_composite(x):
    al = x[..., 3:4] / 255.0
    rgb = x[..., :3] * al + 128 * (1 - al)
    return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]

def ssim(a, b):
    from numpy.lib.stride_tricks import sliding_window_view as swv
    A = gray_composite(a.astype(np.float64)); B = gray_composite(b.astype(np.float64))
    if A.shape[0] < 8 or A.shape[1] < 8: return 1.0
    wa = swv(A, (8, 8))[::4, ::4]; wb = swv(B, (8, 8))[::4, ::4]
    ma = wa.mean(axis=(-1, -2)); mb = wb.mean(axis=(-1, -2))
    va = wa.var(axis=(-1, -2)); vb = wb.var(axis=(-1, -2))
    cov = ((wa - ma[..., None, None]) * (wb - mb[..., None, None])).mean(axis=(-1, -2))
    C1 = (0.01 * 255) ** 2; C2 = (0.03 * 255) ** 2
    s = ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma ** 2 + mb ** 2 + C1) * (va + vb + C2))
    return float(s.mean())

def encode(rgba, bw, bh, preset):
    h, w = rgba.shape[:2]
    ctx = ASTCContext(ASTCConfig(ASTCProfile.LDR, bw, bh, 1, preset))
    img = ASTCImage(ASTCType.U8, w, h, 1, rgba.tobytes())
    sw = ASTCSwizzle.from_str('RGBA')
    comp = ctx.compress(img, sw)
    out = ASTCImage(ASTCType.U8, w, h, 1)
    ctx.decompress(comp, out, sw)
    dec = np.frombuffer(out.data, dtype=np.uint8).reshape(h, w, 4)
    return comp, dec

def write_ktx(path, w, h, bw, bh, data: bytes):
    """KTX v1 — Phaser 3.60+ `load.texture({ ASTC: { type: 'KTX' } })` 가 읽는 컨테이너."""
    ident = b'\xABKTX 11\xBB\r\n\x1A\n'
    hdr = struct.pack('<13I', 0x04030201, 0, 1, 0, ASTC_FMT[(bw, bh)], GL_RGBA, w, h, 0, 0, 1, 1, 0)
    n = len(data); pad = (4 - n % 4) % 4
    with open(path, 'wb') as f:
        f.write(ident); f.write(hdr); f.write(struct.pack('<I', n)); f.write(data); f.write(b'\0' * pad)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--deploy', required=True)
    ap.add_argument('--quality', default='medium', choices=['fast', 'medium', 'thorough'])
    ap.add_argument('--limit', type=int, default=0)
    a = ap.parse_args()
    preset = {'fast': ASTCQualityPreset.FAST, 'medium': ASTCQualityPreset.MEDIUM, 'thorough': ASTCQualityPreset.THOROUGH}[a.quality]
    D = a.deploy
    man = json.load(open(os.path.join(D, 'ui-assets.json'), encoding='utf-8'))
    # 대상: 매니페스트 + 매니페스트 밖 업로드(부지 아트) + 손님 시트.
    targets = {}  # key -> (src path, out ktx rel path, kind)
    up = os.path.join(D, 'ui', 'uploads')
    for f in os.listdir(up):
        key, ext = os.path.splitext(f)
        if ext.lower() not in ('.png', '.webp'): continue
        kind = classify(key)
        if not kind: continue
        targets[key] = (os.path.join(up, f), f'ui/uploads/{key}.ktx', kind)
    cust = os.path.join(D, 'customers')
    if os.path.isdir(cust) and not ASTC_DISABLED:
        for f in os.listdir(cust):
            m = re.match(r'^(Custmer_\d\d)\.(png|webp)$', f)
            if m: targets['cust:' + m.group(1)] = (os.path.join(cust, f), f'customers/{m.group(1)}.ktx', 'char')
    out = {}; stats = {'bg': [0, 0, 0], 'char': [0, 0, 0]}; skipped = []; t0 = time.time(); n = 0
    for key, (src, rel, kind) in sorted(targets.items()):
        if a.limit and n >= a.limit: break
        n += 1
        im = Image.open(src).convert('RGBA'); rgba = np.array(im); h, w = rgba.shape[:2]
        chosen = None
        for (bw, bh) in RULES[kind]['blocks']:
            comp, dec = encode(rgba, bw, bh, preset)
            s = ssim(rgba, dec)
            if s >= RULES[kind]['ssim']:
                chosen = (bw, bh, comp, s); break
        if not chosen:
            skipped.append((key, kind, round(s, 4))); continue
        bw, bh, comp, s = chosen
        write_ktx(os.path.join(D, rel), w, h, bw, bh, comp)
        out[key] = {'ktx': rel, 'block': f'{bw}x{bh}', 'ssim': round(s, 4), 'bytes': len(comp), 'rgba': w * h * 4}
        st = stats[kind]; st[0] += 1; st[1] += w * h * 4; st[2] += len(comp)
    json.dump(out, open(os.path.join(D, 'ui-assets-astc.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    MB = lambda b: f'{b / 1048576:.1f}MB'
    print(f'ASTC 굽기 완료 {len(out)}장 ({time.time() - t0:.0f}s, {a.quality})')
    for kind, (c, r, k) in stats.items(): print(f'  {kind:5} {c:4}장  RGBA {MB(r)} → ASTC {MB(k)}')
    if skipped: print('  화질 게이트 미달(RGBA 유지):', ', '.join(f'{k}({s})' for k, _, s in skipped[:20]), '…' if len(skipped) > 20 else '')

if __name__ == '__main__':
    main()
