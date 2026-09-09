"""Sinh favicon + logo header tu file goc cua cong ty.

    cd floor-manager-web/brand-src && python make-icons.py

Ghi de cac file trong ../static/: vhe-logo.png, favicon.ico, icon-192.png,
icon-512.png, apple-touch-icon.png. Chi chay lai khi doi bo nhan dien.
Yeu cau: pip install pillow
"""
from PIL import Image
import os

SRC = "VHE_Logo.png"
OUT = "../static"

img = Image.open(SRC).convert("RGBA")
img = img.crop(img.getbbox())          # bo phan trong suot thua
W, H = img.size

# 1) Logo header: gioi han chieu cao 128px (hien thi ~36px, du net cho man 3x)
logo = img.resize((round(W * 128 / H), 128), Image.LANCZOS)
logo.save(os.path.join(OUT, "vhe-logo.png"), optimize=True)

# 2) Favicon: chi lay phan chu "VHE" o nua tren. Bo dong "Engineering" vi o
#    16-32px no chi con la vet mo. Dem vao canvas VUONG de trinh duyet khong
#    keo meo (file .ico cong ty gui la 256x141, khong vuong).
mark = img.crop((0, 0, W, int(H * 0.62)))
mark = mark.crop(mark.getbbox())
mw, mh = mark.size
side = max(mw, mh)
pad = int(side * 0.02)
canvas = Image.new("RGBA", (side + pad * 2, side + pad * 2), (0, 0, 0, 0))
canvas.paste(mark, (pad + (side - mw) // 2, pad + (side - mh) // 2), mark)

canvas.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "icon-512.png"), optimize=True)
canvas.resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, "icon-192.png"), optimize=True)

# apple-touch-icon phai co nen dac — iOS khong ho tro alpha
apple = Image.new("RGBA", canvas.size, (255, 255, 255, 255))
apple.alpha_composite(canvas)
apple.convert("RGB").resize((180, 180), Image.LANCZOS).save(
    os.path.join(OUT, "apple-touch-icon.png"), optimize=True)

canvas.save(os.path.join(OUT, "favicon.ico"),
            sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

print("Da sinh lai icon trong static/")
