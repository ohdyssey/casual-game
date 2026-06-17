# 로고 PNG의 단색 배경(흰색 또는 녹색 크로마)을 투명 처리한다.
# 핵심: 가장자리에서 flood-fill 로 "배경에 연결된" 배경색만 제거 → 로고 내부의 흰색/녹색(예: 엠블럼 속 축구장)은 보존.
# 녹색 모드는 유지 픽셀의 녹색 끼(엣지 프린지)를 despill 로 완화한다. chroma.cjs(sharp)의 의존성 없는(PIL) 일반화 버전.
#
# 사용: python scripts/logo-keyout.py <input.png> [output.png]
#   배경색(white|green)은 네 모서리에서 자동 판정. output 생략 시 <name>_logo_t.png 로 저장.
# 출력: public/art/ 의 <name>_logo_t.png  (허브 카드 로고 오버레이용)
import sys
from collections import deque
from pathlib import Path
from PIL import Image


def is_green(r, g, b):
    # chroma.cjs 와 동일 판정: 순수~밝은 녹색.
    return g > 130 and r < 110 and b < 120 and (g - r) > 55 and (g - b) > 35


def is_white(r, g, b):
    mn, mx = min(r, g, b), max(r, g, b)
    return mn >= 236 and (mx - mn) <= 14  # 거의 무채색 흰색만


def detect_mode(px, w, h):
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    if all(is_green(c[0], c[1], c[2]) for c in corners):
        return 'green'
    if all(is_white(c[0], c[1], c[2]) for c in corners):
        return 'white'
    raise SystemExit(f'배경색 자동판정 실패(모서리={corners}). white/green 단색 배경이 아님.')


def key_out(src: Path, out: Path) -> str:
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    px = im.load()
    mode = detect_mode(px, w, h)
    is_bg = is_green if mode == 'green' else is_white

    # 1) 테두리에서 flood-fill: 배경에 연결된 배경색 픽셀만 투명화(로고 경계/내부에서 멈춤).
    visited = bytearray(w * h)
    dq = deque()
    for x in range(w):
        dq.append((x, 0)); dq.append((x, h - 1))
    for y in range(h):
        dq.append((0, y)); dq.append((w - 1, y))
    while dq:
        x, y = dq.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        r, g, b, a = px[x, y]
        if not is_bg(r, g, b):
            continue
        px[x, y] = (r, g, b, 0)
        dq.append((x + 1, y)); dq.append((x - 1, y))
        dq.append((x, y + 1)); dq.append((x, y - 1))

    # 2) 경계 처리: 투명에 인접한 유지 픽셀.
    snap = im.copy().load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = snap[x, y]
            if a == 0:
                continue
            if not any(0 <= x + dx < w and 0 <= y + dy < h and snap[x + dx, y + dy][3] == 0
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                continue
            if mode == 'green':
                # despill: 녹색 끼 완화 + 강한 녹색 프린지는 알파 감쇠.
                if g > r and g > b:
                    ng = int((r + b) / 2 + (g - (r + b) / 2) * 0.5)
                    spill = g - max(r, b)
                    na = a if spill < 60 else int(a * max(0.0, (90 - spill) / 30.0))
                    px[x, y] = (r, ng, b, min(a, na))
            else:
                # white: 밝은 헤일로 알파를 흰색도에 비례해 감쇠.
                mn = min(r, g, b)
                if mn >= 205:
                    na = int(a * max(0.0, (255 - mn) / 50.0))
                    if na < a:
                        px[x, y] = (r, g, b, na)

    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out)
    return f'{out.name} (mode={mode})'


def main():
    if len(sys.argv) < 2:
        print('usage: python scripts/logo-keyout.py <input.png> [output.png]')
        raise SystemExit(2)
    src = Path(sys.argv[1])
    if len(sys.argv) >= 3:
        out = Path(sys.argv[2])
    else:
        stem = src.stem.replace('_Logo', '').replace('_logo', '')
        out = src.with_name(f'{stem}_logo_t.png')
    print('ok', key_out(src, out))


if __name__ == '__main__':
    main()
