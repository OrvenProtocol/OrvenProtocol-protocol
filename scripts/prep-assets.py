# One-off asset prep: run `python -I scripts/prep-assets.py` after changing brand/ files.
# Reads brand/LOGO ORVEN PNG...png (RGBA, colour type 6, transparent area is pure black rgb(0,0,0)).
# - crops to the alpha bounding box
# - resizes in PREMULTIPLIED space so the black matte cannot bleed into edges
# - traces the favicon from the real pixel grid (contours of the 2000px alpha mask)
import re
import numpy as np
import cv2
from PIL import Image

SRC = 'brand/LOGO ORVEN PNG...png'
im = np.array(Image.open(SRC).convert('RGBA')).astype(np.float64)
alpha = im[..., 3] / 255.0
ys, xs = np.where(alpha > 0.02)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
pad = int(0.02 * max(x1 - x0, y1 - y0))
x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
x1, y1 = min(im.shape[1], x1 + pad), min(im.shape[0], y1 + pad)
crop = im[y0:y1, x0:x1]
print('bbox', x0, y0, x1, y1)

def premul_resize(arr, size):
    a = arr[..., 3:4] / 255.0
    pm = np.concatenate([arr[..., :3] * a, arr[..., 3:4]], axis=2).astype(np.float32)
    h, w = pm.shape[:2]
    s = size / max(h, w)
    out = cv2.resize(pm, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
    oa = out[..., 3:4] / 255.0
    rgb = np.where(oa > 0, out[..., :3] / np.maximum(oa, 1e-6), 0)
    # artwork is single-ink; edge rgb in the source carries light fringe, so colour is pinned to the ink token (#000000) and only alpha is kept
    res = np.concatenate([np.zeros_like(rgb), out[..., 3:4]], axis=2).round().astype(np.uint8)
    return Image.fromarray(res, 'RGBA')

for size in (720, 128):
    premul_resize(crop, size).save(f'src/assets/logo-{size}.png', optimize=True)
    print('wrote logo', size)

# favicon trace
mask = (crop[..., 3] > 127).astype(np.uint8) * 255
cs, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
h, w = mask.shape
S = 32 / max(h, w)
ox, oy = (32 - w * S) / 2, (32 - h * S) / 2
paths = []
for c in cs:
    if cv2.contourArea(c) < 400:
        continue
    ap = cv2.approxPolyDP(c, 0.004 * cv2.arcLength(c, True), True)[:, 0, :]
    pts = [(round(x * S + ox, 2), round(y * S + oy, 2)) for x, y in ap]
    paths.append('M' + ' '.join(f'{x:g} {y:g}' for x, y in pts) + 'Z')
tokens = open('src/tokens.css', encoding='utf8').read()
ink = re.search(r'--ink:\s*(#[0-9a-fA-F]{6})', tokens).group(1)
svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
       f'<path fill="{ink}" fill-rule="evenodd" d="{" ".join(paths)}"/></svg>\n')
assert '--' not in svg
open('src/favicon.svg', 'w', encoding='utf8').write(svg)
print('favicon contours', len(paths))

# Elysium lockup: taken from reference/new/ORVEN 1.jpg.jpeg (pixels x 240-425, y 8-62 of 1600x900).
# The slide is a JPEG on an off-white canvas, so ink coverage is rebuilt as alpha from luminance
# (canvas #fafcf9 -> 0, deepest ink #122021 -> 255) and colour is pinned to the --elysium token.
lock = Image.open('reference/new/ORVEN 1.jpg.jpeg').convert('RGB').crop((240, 8, 425, 62))
lock = lock.resize((lock.width * 3, lock.height * 3), Image.LANCZOS)
g = np.array(lock.convert('L')).astype(np.float64)
a = np.clip((250 - g) / (250 - 31), 0, 1)
ely = re.search(r'--elysium:\s*#([0-9a-fA-F]{6})', tokens).group(1)
rgb = np.array([int(ely[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.uint8)
out = np.zeros(g.shape + (4,), dtype=np.uint8)
out[..., :3] = rgb
out[..., 3] = (a * 255).round().astype(np.uint8)
Image.fromarray(out, 'RGBA').save('src/assets/elysium-lockup.png', optimize=True)
print('wrote elysium lockup', out.shape[1], out.shape[0])
