# Renders the PNG and ICO versions of icons/favicon.svg: green "AK" in monospace on the site's dark background.
# usage: python3 icons/make_icons.py   (needs Pillow; run on a Mac for SF Mono)
import io
import os
import struct

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
BG, INK = (7, 6, 26, 255), (125, 255, 155, 255)
FONT = "/System/Library/Fonts/SFNSMono.ttf"


def icon(size, rounded):
    # Drawn 8x larger, then scaled down, for smooth edges at tab size.
    big = size * 8
    k = big / 64
    im = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=int(12 * k), fill=BG)
    else:
        d.rectangle([0, 0, big, big], fill=BG)
    font = ImageFont.truetype(FONT, int(30 * k))
    font.set_variation_by_name("Bold")
    # Same placement as the SVG: centred, baseline at y = 43 of 64.
    d.text((32 * k, 43 * k), "AK", font=font, fill=INK, anchor="ms")
    return im.resize((size, size), Image.LANCZOS)


def ico(images, path):
    # An ICO file whose entries are PNGs, which every current browser reads.
    pngs = []
    for im in images:
        buf = io.BytesIO()
        im.save(buf, "PNG")
        pngs.append((im.size[0], buf.getvalue()))
    out = struct.pack("<HHH", 0, 1, len(pngs))
    offset = 6 + 16 * len(pngs)
    for size, data in pngs:
        out += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    with open(path, "wb") as f:
        f.write(out + b"".join(d for _, d in pngs))


icon(32, True).save(os.path.join(HERE, "favicon-32.png"))
# Home screen icons are square: the phone rounds the corners itself.
icon(180, False).save(os.path.join(HERE, "apple-touch-icon.png"))
ico([icon(16, True), icon(32, True), icon(48, True)], os.path.join(HERE, "favicon.ico"))
print("wrote favicon-32.png, apple-touch-icon.png, favicon.ico")
