# 헤더 로고 만들기: python3 -I scripts/make-logo.py public/freesnow_logo3.jpeg public/logo-white.png
# freesnow_logo3.jpeg(검정 로고 + 흰 바탕) → 여백 자르고, 밝기를 투명도로 바꾼 흰 로고 PNG (어두운 헤더용, 높이 120px)
import sys
from PIL import Image, ImageOps
src, out = sys.argv[1], sys.argv[2]
g = ImageOps.grayscale(Image.open(src))
ink = g.point(lambda v: 255 - v)                    # 검정일수록 진하게
ink = ink.point(lambda v: 0 if v < 24 else min(255, int((v - 24) * 255 / 200)))  # 바탕 얼룩 지우고 대비
box = ink.getbbox()
pad = 8
box = (max(0, box[0] - pad), max(0, box[1] - pad), min(g.width, box[2] + pad), min(g.height, box[3] + pad))
alpha = ink.crop(box)
h = 120                                              # 헤더 높이의 약 3배 (레티나)
w = round(alpha.width * h / alpha.height)
alpha = alpha.resize((w, h), Image.LANCZOS)
logo = Image.new('RGBA', (w, h), (255, 255, 255, 0))
logo.putalpha(alpha)
logo.save(out, optimize=True)
print(box, logo.size)
