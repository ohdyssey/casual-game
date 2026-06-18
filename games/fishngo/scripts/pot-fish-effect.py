from PIL import Image
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'public', 'sprites', 'fishing_effect.webp')
DST = SRC  # overwrite

src = Image.open(SRC).convert('RGBA')
assert src.size == (1248, 1248), src.size

OLD_CELL = 624
NEW_CELL = 1024
GRID = 2
NEW_SIZE = NEW_CELL * GRID  # 2048

out = Image.new('RGBA', (NEW_SIZE, NEW_SIZE), (0, 0, 0, 0))

for row in range(GRID):
    for col in range(GRID):
        sx = col * OLD_CELL
        sy = row * OLD_CELL
        cell = src.crop((sx, sy, sx + OLD_CELL, sy + OLD_CELL))
        bbox = cell.getbbox()
        if bbox is None:
            print(f'cell ({col},{row}) empty')
            continue
        content = cell.crop(bbox)
        cw, ch = content.size
        dx = col * NEW_CELL + (NEW_CELL - cw) // 2
        dy = row * NEW_CELL + (NEW_CELL - ch) // 2
        out.paste(content, (dx, dy), content)
        print(f'cell ({col},{row}) bbox={bbox} content={cw}x{ch} -> ({dx},{dy})')

out.save(DST, 'WEBP', quality=92, method=6)
print('OK', DST, out.size)
