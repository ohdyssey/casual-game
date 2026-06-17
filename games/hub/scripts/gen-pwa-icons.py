"""PWA 아이콘 생성 — 허브 로고(art/playpop_logo.png)를 브랜드 다크 배경에 얹어
192/512/maskable/apple-touch 아이콘으로 굽는다. 재실행 가능(아이콘 갱신 시 로고만 교체).

  python games/hub/scripts/gen-pwa-icons.py   # (games/hub 에서 실행)
"""
import os
from PIL import Image

SRC = 'public/art/playpop_logo.png'
OUT = 'public/icons'
BG = (11, 16, 32, 255)  # 허브 테마 #0B1020 — 홈 화면 아이콘 대비 확보

os.makedirs(OUT, exist_ok=True)
src = Image.open(SRC).convert('RGBA')


def make(size, logo_frac, fname):
    """size x size 캔버스 중앙에 로고를 logo_frac 비율로 배치(종횡비 유지)."""
    canvas = Image.new('RGBA', (size, size), BG)
    box = int(size * logo_frac)
    lw, lh = src.size
    scale = min(box / lw, box / lh)
    nw, nh = max(1, int(lw * scale)), max(1, int(lh * scale))
    logo = src.resize((nw, nh), Image.LANCZOS)
    canvas.alpha_composite(logo, ((size - nw) // 2, (size - nh) // 2))
    canvas.save(os.path.join(OUT, fname))
    print(f'  wrote {fname} ({size}x{size}, logo {int(logo_frac*100)}%)')


# any-purpose: 로고 80%
make(192, 0.80, 'icon-192.png')
make(512, 0.80, 'icon-512.png')
# maskable: 마스크 안전영역 위해 로고 62%(여백 충분)
make(512, 0.62, 'icon-maskable-512.png')
# iOS 홈화면 아이콘(투명 무시 → 불투명 배경 필수)
make(180, 0.80, 'apple-touch-icon-180.png')
print('done')
