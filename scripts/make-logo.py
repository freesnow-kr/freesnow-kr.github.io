# 헤더 로고, 앱 아이콘 만들기: python3 -I scripts/make-logo.py public/freesnow_logo3.jpeg public
# freesnow_logo3.jpeg(검정 로고 + 흰 바탕) → 여백 자르고, 밝기를 투명도로 바꾼 흰 로고
#   logo-white.png             헤더 로고 (높이 120px, 투명 바탕)
#   icon-192.png, icon-512.png 앱 아이콘 (검정 바탕 + 흰 로고, manifest.webmanifest)
#   icon-maskable-512.png      안드로이드가 동그라미 등으로 잘라도 로고가 안 잘리게 여백 넉넉히
#   apple-touch-icon.png       아이폰 홈 화면 아이콘 (180px)
import sys
from PIL import Image, ImageOps

src, out = sys.argv[1], sys.argv[2]
g = ImageOps.grayscale(Image.open(src))
ink = g.point(lambda v: 255 - v)  # 검정일수록 진하게
ink = ink.point(lambda v: 0 if v < 24 else min(255, int((v - 24) * 255 / 200)))  # 바탕 얼룩 지우고 대비
box = ink.getbbox()
pad = 8
box = (max(0, box[0] - pad), max(0, box[1] - pad), min(g.width, box[2] + pad), min(g.height, box[3] + pad))
alpha = ink.crop(box)


def white(a):
    im = Image.new('RGBA', a.size, (255, 255, 255, 0))
    im.putalpha(a)
    return im


def fit(h=None, w=None):
    scale = h / alpha.height if h else w / alpha.width
    return alpha.resize((round(alpha.width * scale), round(alpha.height * scale)), Image.LANCZOS)


white(fit(h=120)).save(f'{out}/logo-white.png', optimize=True)


def icon(size, logo_width, name):
    bg = Image.new('RGB', (size, size), (11, 13, 18))  # --black
    logo = white(fit(w=round(size * logo_width)))
    bg.paste(logo, ((size - logo.width) // 2, (size - logo.height) // 2), logo)
    bg.save(f'{out}/{name}', optimize=True)


icon(192, 0.8, 'icon-192.png')
icon(512, 0.8, 'icon-512.png')
icon(512, 0.62, 'icon-maskable-512.png')  # 안전 영역(가운데 80% 원) 안에
icon(180, 0.8, 'apple-touch-icon.png')
print('ok', box)
