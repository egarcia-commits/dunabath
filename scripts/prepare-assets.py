#!/usr/bin/env python3
"""Prepare DUNA Bath website images, logos, favicons, OG image and redacted catalogue."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path("/workspace/dunabath")
SRC = ROOT / "source"
PDF_IMG = SRC / "pdf-images"
OUT = ROOT / "website" / "public"
IMG = OUT / "img"
CREAM = (246, 244, 239, 255)
NAVY = (31, 52, 64)
TEAL = (78, 129, 150)  # #4E8196
BROWN = (110, 86, 54)  # #6E5636
CREAM_RGB = (246, 244, 239)
LIGHT_WAVE = (163, 196, 208)  # #A3C4D0

WEBP_Q = 82
JPEG_Q = 88


def ensure(p: Path) -> Path:
    p.mkdir(parents=True, exist_ok=True)
    return p


def save_pair(im: Image.Image, dest_stem: Path, webp_q=WEBP_Q, jpeg=False):
    dest_stem.parent.mkdir(parents=True, exist_ok=True)
    # PNG if has alpha, else we still write webp + png preview where useful
    if im.mode == "RGBA" or (im.mode == "RGB" and dest_stem.name.startswith("logo")):
        im.save(dest_stem.with_suffix(".png"), "PNG", optimize=True)
    im.save(dest_stem.with_suffix(".webp"), "WEBP", quality=webp_q, method=6)
    if jpeg and im.mode in ("RGB", "L"):
        im.save(dest_stem.with_suffix(".jpg"), "JPEG", quality=JPEG_Q, optimize=True, subsampling=2)
    print("  wrote", dest_stem.name, im.size, im.mode)


def knock_white_to_alpha(im: Image.Image, colors, solid_dist=28) -> Image.Image:
    """Turn a white-background logo into straight-alpha, recovering edge color."""
    arr = np.array(im.convert("RGBA")).astype(np.float32)
    rgb = arr[:, :, :3]
    colors = np.array(colors, dtype=np.float32)
    white = np.array([255, 255, 255], dtype=np.float32)
    # distance to white
    to_white = np.linalg.norm(rgb - white, axis=2)
    # nearest brand color
    dists = [np.linalg.norm(rgb - c, axis=2) for c in colors]
    dist_c = np.stack(dists, axis=2)
    nearest = dist_c.argmin(axis=2)
    min_d = dist_c.min(axis=2)
    h, w = to_white.shape
    out = np.zeros((h, w, 4), dtype=np.float32)
    for i, c in enumerate(colors):
        mask = nearest == i
        # alpha from unblend: obs = fg * a + white * (1-a) => a = (white-obs)/(white-fg)
        denom = np.clip(white - c, 1, None)
        a_ch = (white - rgb) / denom
        # use median-like: channels where denom is meaningful
        a = np.median(np.clip(a_ch, 0, 1), axis=2)
        # solid pixels
        a = np.where(min_d < solid_dist, 1.0, a)
        # almost white
        a = np.where(to_white < 8, 0.0, a)
        out[mask, 0] = c[0]
        out[mask, 1] = c[1]
        out[mask, 2] = c[2]
        out[mask, 3] = a[mask] * 255
    # fully transparent where almost white
    out[to_white < 8, 3] = 0
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def trim(im: Image.Image, pad=8) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(im.width, r + pad)
    b = min(im.height, b + pad)
    return im.crop((l, t, r, b))


def recolor_logo(im: Image.Image, mapping) -> Image.Image:
    """Replace exact-ish brand colors, keep alpha. mapping: {(r,g,b): (r,g,b)}"""
    arr = np.array(im.convert("RGBA"))
    rgb = arr[:, :, :3].astype(np.int16)
    out = arr.copy()
    keys = np.array(list(mapping.keys()), dtype=np.int16)
    vals = np.array(list(mapping.values()), dtype=np.int16)
    # classify by nearest key
    dists = [np.abs(rgb - k).sum(axis=2) for k in keys]
    idx = np.stack(dists, axis=2).argmin(axis=2)
    for i, v in enumerate(vals):
        m = idx == i
        out[m, 0] = v[0]
        out[m, 1] = v[1]
        out[m, 2] = v[2]
    return Image.fromarray(out, "RGBA")


def compose_pdf_logo() -> Image.Image:
    rgb = Image.open(PDF_IMG / "img-001.png").convert("RGB")
    mask = Image.open(PDF_IMG / "img-002.png")
    im = rgb.convert("RGBA")
    im.putalpha(mask)
    return trim(im, pad=12)


def wave_path_svg(pts, y_offset=0, scale=1):
    # Build a smooth cubic from samples
    if len(pts) < 4:
        return ""
    # scale
    pts = [(x * scale, (y + y_offset) * scale) for x, y in pts]
    d = [f"M {pts[0][0]:.2f},{pts[0][1]:.2f}"]
    # simple catmull-rom to cubic
    p = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        c1x = p1[0] + (p2[0] - p0[0]) / 6
        c1y = p1[1] + (p2[1] - p0[1]) / 6
        c2x = p2[0] - (p3[0] - p1[0]) / 6
        c2y = p2[1] - (p3[1] - p1[1]) / 6
        d.append(f"C {c1x:.2f},{c1y:.2f} {c2x:.2f},{c2y:.2f} {p2[0]:.2f},{p2[1]:.2f}")
    return " ".join(d)


def build_svg_logo():
    """Recreate the logo as SVG using measured geometry + sampled wave."""
    # Viewbox based on original PNG canvas 900x437, content padded
    # Letters from measurements of logo-original.png
    navy = "#1F3440"
    teal = "#4E8196"
    brown = "#6E5636"
    sw = 15  # stroke width of DUNA
    # Wave samples from original (absolute coords)
    wave_pts = []
    im = Image.open(SRC / "logo-original.png").convert("RGBA")
    arr = np.array(im)
    ink = (arr[:, :, :3] < 245).any(axis=2)
    for x in range(218, 682):
        ys = np.where(ink[280:330, x])[0]
        if len(ys):
            wave_pts.append((x, 280 + ys.mean()))

    wave_d = wave_path_svg(wave_pts)

    # Letter paths as strokes (geometric approximation)
    # D: x 74-159, y 53-243. Left stem 74-90, bowl right.
    # Use filled paths for better fidelity of D's rounded cap/base.
    # We'll draw with stroke + rounded caps for U, N, A; custom path for D.
    #
    # D outline (outer rounded-D, inner hole):
    # Left stem outer x=74, inner x=89.5
    # Top starts ~y=53, bottom ~y=243
    # Right extremity x=159
    d_path = (
        # outer: start top-left, across top, down the bowl, across bottom, up left stem
        "M 74,53 H 120 "
        "C 150,53 159,75 159,148 "
        "C 159,221 150,243 120,243 "
        "H 74 Z "
        # inner hole (counterclockwise)
        "M 89.5,68 H 118 "
        "C 136,68 144,86 144,148 "
        "C 144,210 136,228 118,228 "
        "H 89.5 Z"
    )
    # U: stems at 299-314 and 373-387, y 53-? bowl at bottom ~243
    # Approximate U as stroke
    # N: left 530-544, right 604-618, diagonal
    # A: apex ~ (793, 53), legs to (745, 243) and (842, 243), bar at y~200

    svg_dark = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 437" fill="none" role="img" aria-label="DUNA Bath">
  <title>DUNA Bath</title>
  <!-- D -->
  <path fill="{navy}" fill-rule="evenodd" d="{d_path}"/>
  <!-- U as rounded stroke -->
  <path stroke="{navy}" stroke-width="{sw}" stroke-linecap="butt" stroke-linejoin="round"
        d="M 306.5,53 V 200 C 306.5,230 322,235.5 343,235.5 C 364,235.5 380.5,230 380.5,200 V 53"/>
  <!-- N -->
  <path stroke="{navy}" stroke-width="{sw}" stroke-linecap="butt" stroke-linejoin="round"
        d="M 537.5,243 V 53 L 610.5,243 V 53"/>
  <!-- A -->
  <path stroke="{navy}" stroke-width="{sw}" stroke-linecap="butt" stroke-linejoin="round"
        d="M 752,243 L 793.5,53 L 835,243"/>
  <path stroke="{navy}" stroke-width="{sw}" stroke-linecap="butt" d="M 768,200 H 819"/>
  <!-- wave -->
  <path stroke="{teal}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" d="{wave_d}"/>
  <!-- BATH -->
  <text x="450" y="380" text-anchor="middle" fill="{brown}"
        font-family="Source Sans 3, Helvetica, Arial, sans-serif"
        font-size="22" font-weight="400" letter-spacing="18">BATH</text>
</svg>
'''
    # This geometric SVG is an approximation; we also ship a pixel-perfect SVG
    # that embeds the raster as a fallback is not wanted. We'll ship a
    # "mark" SVG (wave) and a wrapper that references the PNG for header? No.
    # Instead, export a cleaner official SVG: the processed PNG is primary,
    # and this geometric SVG is used only if it looks close. We'll refine later
    # if needed. Also write a light version.
    svg_light = (svg_dark
                 .replace(navy, "#F6F4EF")
                 .replace(teal, "#A3C4D0")
                 .replace(brown, "#F6F4EF"))
    return svg_dark, svg_light, wave_d


def fit_on_cream(im: Image.Image, canvas_w: int, canvas_h: int, pad_ratio=0.08) -> Image.Image:
    canvas = Image.new("RGB", (canvas_w, canvas_h), CREAM_RGB)
    src = im.convert("RGB")
    pad_x = int(canvas_w * pad_ratio)
    pad_y = int(canvas_h * pad_ratio)
    box_w = canvas_w - pad_x * 2
    box_h = canvas_h - pad_y * 2
    scale = min(box_w / src.width, box_h / src.height)
    nw, nh = max(1, int(src.width * scale)), max(1, int(src.height * scale))
    src = src.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (canvas_w - nw) // 2
    y = (canvas_h - nh) // 2
    canvas.paste(src, (x, y))
    return canvas


def make_favicon_and_mark(logo: Image.Image):
    """Wave-on-navy mark, plus favicon set."""
    mark_svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="DUNA Bath">
  <rect width="64" height="64" rx="10" fill="#1F3440"/>
  <path d="M10 36 C 20 24, 30 24, 32 32 S 44 48, 54 32" fill="none" stroke="#A3C4D0" stroke-width="2.6" stroke-linecap="round"/>
</svg>
'''
    (IMG / "marca" / "mark.svg").write_text(mark_svg, encoding="utf-8")
    (OUT / "favicon.svg").write_text(mark_svg, encoding="utf-8")

    # raster favicons from the SVG-like mark drawn with PIL
    def paint_mark(size, bg=NAVY, wave=LIGHT_WAVE, radius_frac=0.16):
        im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        r = int(size * radius_frac)
        d.rounded_rectangle((0, 0, size - 1, size - 1), radius=r, fill=bg + (255,))
        # wave polyline
        pts = []
        for i in range(0, 101):
            t = i / 100
            x = size * (0.16 + 0.68 * t)
            # two-hump sine-ish
            y = size * (0.56 + 0.16 * math.sin((t - 0.08) * math.pi * 1.6) * (1 if t < 0.55 else 0.9)
                        - 0.10 * math.sin(t * math.pi * 2.2))
            pts.append((x, y))
        w = max(2, int(size * 0.05))
        d.line(pts, fill=wave + (255,), width=w, joint="curve")
        return im

    ico_sizes = [16, 32, 48]
    icos = [paint_mark(s).convert("RGBA") for s in ico_sizes]
    icos[0].save(OUT / "favicon.ico", sizes=[(s, s) for s in ico_sizes])
    paint_mark(32).save(IMG / "marca" / "favicon-32.png")
    paint_mark(180).save(OUT / "apple-touch-icon.png")
    paint_mark(192).save(IMG / "marca" / "icon-192.png")
    paint_mark(512).save(IMG / "marca" / "icon-512.png")
    # also a cream-bg version for light PWA if needed
    paint_mark(180, bg=CREAM_RGB, wave=TEAL).save(IMG / "marca" / "icon-light-180.png")
    print("  favicons written")


def make_og(hero: Image.Image, logo: Image.Image):
    W, H = 1200, 630
    canvas = Image.new("RGB", (W, H), CREAM_RGB)
    # right photo
    photo = hero.convert("RGB")
    # cover crop for the right 55%
    target_w, target_h = 640, 630
    scale = max(target_w / photo.width, target_h / photo.height)
    nw, nh = int(photo.width * scale), int(photo.height * scale)
    photo = photo.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - target_w) // 2
    top = (nh - target_h) // 2
    photo = photo.crop((left, top, left + target_w, top + target_h))
    canvas.paste(photo, (W - target_w, 0))
    # logo on the left
    lg = logo.convert("RGBA")
    lw = 380
    lh = int(lg.height * (lw / lg.width))
    lg = lg.resize((lw, lh), Image.Resampling.LANCZOS)
    canvas.paste(lg, (70, 150), lg)
    # tagline under logo – we'll overlay typography later in a second pass if fonts load
    try:
        # try a serif from the system; otherwise skip text (logo is enough)
        font_paths = list(Path("/usr/share/fonts").rglob("*.ttf"))
        serif = None
        for p in font_paths:
            n = p.name.lower()
            if "dejavu" in n and "serif" in n and "bold" not in n:
                serif = str(p)
                break
        if serif:
            font = ImageFont.truetype(serif, 28)
            d = ImageDraw.Draw(canvas)
            d.text((70, 150 + lh + 24), "Kits de mamparas. Vidrio a medida.", font=font, fill=NAVY)
    except Exception as e:
        print("  og text skipped", e)
    dest = IMG / "og-cover"
    save_pair(canvas, dest, webp_q=80, jpeg=True)
    canvas.save(IMG / "og-cover.jpg", "JPEG", quality=88, optimize=True)


def redact_catalogue():
    import fitz
    src = SRC / "catalogo-slim.pdf"
    dest = OUT / "downloads" / "DUNA-Bath-Catalogo-Slim.pdf"
    dest.parent.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(src)
    found = False
    for i, page in enumerate(doc):
        for needle in ("wsonet.com",):
            hits = page.search_for(needle)
            for r in hits:
                found = True
                # expand a bit to cover glyphs fully
                rect = fitz.Rect(r.x0 - 1, r.y0 - 1, r.x1 + 1, r.y1 + 1)
                # page 11 is navy; keep cream text
                pix = page.get_pixmap(clip=rect, alpha=False)
                # detect if background is dark
                # Use navy fill + cream text
                page.add_redact_annot(
                    rect,
                    text="ventas@dunabath.com",
                    fill=(31 / 255, 52 / 255, 64 / 255),
                    text_color=(246 / 255, 244 / 255, 239 / 255),
                    fontsize=max(6, rect.height * 0.7),
                )
                print(f"  redact page {i+1} at {tuple(rect)} h={rect.height:.1f}")
    if found:
        page = doc[10] if doc.page_count >= 11 else doc[-1]
        page.apply_redactions(images=0)
    else:
        print("  WARNING: email string not found; covering likely area on last page")
        page = doc[-1]
        # last page navy left column, near bottom (from the preview)
        # We'll search for 'wsonet' or any email-like
        words = page.get_text("words")
        for w in words:
            if "wsonet" in w[4].lower():
                print("  word", w)
                rect = fitz.Rect(w[0], w[1], w[2], w[3])
                page.add_redact_annot(rect, fill=(31 / 255, 52 / 255, 64 / 255))
        page.apply_redactions(images=0)
    # also scrub metadata
    doc.set_metadata({
        "title": "DUNA Bath — Catálogo profesional Slim",
        "author": "DUNA Bath / WSO Operations S.L.",
        "subject": "Kits de mamparas. Vidrio a medida.",
        "creator": "DUNA Bath",
        "producer": "DUNA Bath",
    })
    dest.parent.mkdir(parents=True, exist_ok=True)
    doc.save(dest, deflate=True, garbage=4)
    doc.close()
    print("  catalogue saved", dest, dest.stat().st_size)
    # verify no personal address remains
    doc2 = fitz.open(dest)
    text = "".join(p.get_text() for p in doc2)
    doc2.close()
    if "wsonet.com" in text.lower():
        print("  ERROR: personal address still present in PDF text")
        print(text[-1500:])
    else:
        print("  verified: no personal address in PDF text")
        if "ventas@dunabath.com" in text:
            print("  replacement email present")


def main():
    ensure(IMG / "marca")
    ensure(IMG / "hero")
    ensure(IMG / "sistema")
    ensure(IMG / "productos")
    ensure(OUT / "downloads")

    print("== logo ==")
    # Prefer the original attachment (Eli's file) knocked out, and also the PDF logo.
    attached = knock_white_to_alpha(
        Image.open(SRC / "logo-original.png"),
        colors=[NAVY, TEAL, BROWN],
    )
    attached = trim(attached, pad=10)
    pdf_logo = compose_pdf_logo()
    # Use whichever is larger / sharper. PDF is 1026px vs attached ~770.
    # The PDF logo may include slight compression. We'll use the attached
    # (Eli's official file) as the wordmark after knockout, and also store
    # the higher-res PDF version if it looks clean.
    logo = attached
    if pdf_logo.width > attached.width * 1.15:
        # scale-compare: use PDF master (higher res, native alpha)
        logo = pdf_logo
        # snap colors on opaque pixels toward brand palette
        logo = knock_white_to_alpha(
            # flatten onto white then unblend, to normalize
            Image.alpha_composite(Image.new("RGBA", logo.size, (255, 255, 255, 255)), logo),
            colors=[NAVY, TEAL, BROWN],
        )
        logo = trim(logo, pad=10)
    print("  master logo", logo.size, logo.mode)
    save_pair(logo, IMG / "marca" / "logo")
    # @2x already large; also a compact header size
    header_w = 720
    header = logo.resize((header_w, int(logo.height * header_w / logo.width)), Image.Resampling.LANCZOS)
    save_pair(header, IMG / "marca" / "logo-header")

    light = recolor_logo(logo, {
        NAVY: CREAM_RGB,
        TEAL: LIGHT_WAVE,
        BROWN: CREAM_RGB,
    })
    save_pair(light, IMG / "marca" / "logo-light")
    light_h = light.resize((header_w, int(light.height * header_w / light.width)), Image.Resampling.LANCZOS)
    save_pair(light_h, IMG / "marca" / "logo-light-header")

    svg_dark, svg_light, _ = build_svg_logo()
    (IMG / "marca" / "logo.svg").write_text(svg_dark, encoding="utf-8")
    (IMG / "marca" / "logo-light.svg").write_text(svg_light, encoding="utf-8")
    print("  svg written (geometric approximation; PNG is the official wordmark)")

    make_favicon_and_mark(logo)

    print("== hero & system photos ==")
    hero = Image.open(PDF_IMG / "img-000.png")
    save_pair(hero.convert("RGB"), IMG / "hero" / "portada", webp_q=80, jpeg=True)
    # a slightly tighter crop (drop a sliver of any white edge)
    harr = np.array(hero.convert("RGB"))
    # if top/left has cream border, crop it
    # simple: use as-is

    order_photo = Image.open(PDF_IMG / "img-032.png").convert("RGB")
    save_pair(order_photo, IMG / "hero" / "pedido", webp_q=80, jpeg=True)

    kit_packed = Image.open(PDF_IMG / "img-003.png").convert("RGB")
    kit_box = Image.open(PDF_IMG / "img-004.png").convert("RGB")
    warehouse = Image.open(PDF_IMG / "img-005.png").convert("RGB")
    packing = Image.open(PDF_IMG / "img-006.png").convert("RGB")
    save_pair(kit_packed, IMG / "sistema" / "kit-embalado", webp_q=80, jpeg=True)
    save_pair(kit_box, IMG / "sistema" / "kit-presentacion", webp_q=80, jpeg=True)
    save_pair(warehouse, IMG / "sistema" / "expedicion", webp_q=80, jpeg=True)
    save_pair(packing, IMG / "sistema" / "detalle-embalaje", webp_q=80, jpeg=True)

    print("== product photos ==")
    # img-007..031 = selecciones 01..25
    CANVAS_W, CANVAS_H = 900, 1125  # 4:5
    THUMB_W = 600
    for i in range(25):
        src = Image.open(PDF_IMG / f"img-{i+7:03d}.png")
        num = f"{i+1:02d}"
        framed = fit_on_cream(src, CANVAS_W, CANVAS_H, pad_ratio=0.09)
        save_pair(framed, IMG / "productos" / f"seleccion-{num}", webp_q=80, jpeg=True)
        thumb = framed.resize((THUMB_W, int(CANVAS_H * THUMB_W / CANVAS_W)), Image.Resampling.LANCZOS)
        save_pair(thumb, IMG / "productos" / f"seleccion-{num}-thumb", webp_q=78, jpeg=True)

    print("== og image ==")
    make_og(hero, logo)

    print("== catalogue PDF (email redacted) ==")
    redact_catalogue()
    print("done")


if __name__ == "__main__":
    main()
