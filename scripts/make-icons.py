"""Generate the PWA / home-screen icons from the brand mark.

    python scripts/make-icons.py

Writes public/icons/icon-192.png, icon-512.png, icon-512-maskable.png and
public/apple-touch-icon.png. Requires Pillow.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

BG = (14, 14, 17, 255)
RING = (52, 211, 153, 90)
LINE = (52, 211, 153, 255)


def draw_mark(size: int, padding_ratio: float, rounded: bool) -> Image.Image:
    scale = 4  # supersample for smooth edges
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(s * 0.24) if rounded else 0
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=BG)
    if rounded:
        d.rounded_rectangle([s * 0.02, s * 0.02, s * 0.98, s * 0.98], radius=int(radius * 0.95), outline=RING, width=int(s * 0.02))
    pad = s * padding_ratio
    w = s - 2 * pad
    # The rising "trajectory" polyline, same shape as the SVG icon.
    pts = [(0.19, 0.69), (0.38, 0.47), (0.52, 0.58), (0.69, 0.31), (0.81, 0.44)]
    poly = [(pad + x * w, pad + y * w) for x, y in pts]
    d.line(poly, fill=LINE, width=int(s * 0.075), joint="curve")
    r = int(s * 0.037)
    for x, y in (poly[0], poly[-1]):
        d.ellipse([x - r, y - r, x + r, y + r], fill=LINE)
    return img.resize((size, size), Image.LANCZOS)


draw_mark(192, 0.04, True).save(OUT / "icon-192.png")
draw_mark(512, 0.04, True).save(OUT / "icon-512.png")
# Maskable icons must keep content inside the central 80% safe zone.
draw_mark(512, 0.16, False).save(OUT / "icon-512-maskable.png")
draw_mark(180, 0.04, True).save(ROOT / "public" / "apple-touch-icon.png")
print("icons written to", OUT)
