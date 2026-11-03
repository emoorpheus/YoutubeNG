"""YouTube Next-Gen icons.

    python3 design/icons/generate.py [VARIANT]      (default: C; needs pycairo, Pillow, Noto Sans JP)

Draws every variant into design/icons/<K>/ (icon.png 80 px, largeIcon.png 130 px, icon.svg),
the comparison sheets design/icons/variants.png and design/icons/launcher.png, and, for the
chosen VARIANT, everything the app ships: assets/icon.png, assets/largeIcon.png, iconColor in
assets/appinfo.json, assets/preview.png, assets/splash.png and src/icons/settings-entry.png.
This file is the one place that decides what the app looks like.

Tube geometry fitted to the reference: superellipse |x/A|^7 + |y/B|^3.75 = 1, aspect 635:445,
red #E52D27."""
import cairo, math, json, os, sys
RED = (0xE5/255, 0x2D/255, 0x27/255)
RED_HI = (0xFF/255, 0x4E/255, 0x45/255)
RED_LO = (0xB8/255, 0x14/255, 0x1A/255)
WHITE = (1, 1, 1); BLACK = (0, 0, 0)
DARK = (0x28/255,)*3; RING = (0x3A/255,)*3
ASPECT = 635/445; N_X, N_Y = 7.0, 3.75

def tube_path(c, cx, cy, w, steps=480):
    A, B = w/2, w/ASPECT/2
    for i in range(steps):
        t = 2*math.pi*i/steps; ct, st = math.cos(t), math.sin(t)
        x = cx + A*math.copysign(abs(ct)**(2/N_X), ct)
        y = cy + B*math.copysign(abs(st)**(2/N_Y), st)
        (c.move_to if i == 0 else c.line_to)(x, y)
    c.close_path()

def rpoly(c, pts, r):
    """Polygon with rounded corners (radius r)."""
    n = len(pts)
    for i in range(n):
        p0, p1, p2 = pts[i-1], pts[i], pts[(i+1) % n]
        v1 = (p0[0]-p1[0], p0[1]-p1[1]); v2 = (p2[0]-p1[0], p2[1]-p1[1])
        l1, l2 = math.hypot(*v1), math.hypot(*v2)
        u1 = (v1[0]/l1, v1[1]/l1); u2 = (v2[0]/l2, v2[1]/l2)
        ang = math.acos(max(-1, min(1, u1[0]*u2[0]+u1[1]*u2[1])))
        d = r/math.tan(ang/2)
        a = (p1[0]+u1[0]*d, p1[1]+u1[1]*d); b = (p1[0]+u2[0]*d, p1[1]+u2[1]*d)
        if i == 0: c.move_to(*a)
        else: c.line_to(*a)
        c.curve_to(p1[0]+(a[0]-p1[0])*0.45, p1[1]+(a[1]-p1[1])*0.45,
                   p1[0]+(b[0]-p1[0])*0.45, p1[1]+(b[1]-p1[1])*0.45, *b)
    c.close_path()

def play(c, cx, cy, h, color, r=0.0, wr=0.92, rim=0.0, rim_color=None):
    """Right-pointing play triangle of height h, optically centred on (cx, cy).
    rim > 0 adds an inner rim of that width in rim_color."""
    w = h*wr; x0 = cx - w*0.42
    pts = [(x0, cy-h/2), (x0+w, cy), (x0, cy+h/2)]
    c.set_source_rgb(*color)
    if r:
        rpoly(c, pts, r*h)
    else:
        c.move_to(*pts[0]); c.line_to(*pts[1]); c.line_to(*pts[2]); c.close_path()
    path = c.copy_path(); c.fill()
    if rim:
        c.save(); c.append_path(path); c.clip()
        c.append_path(path); c.set_source_rgb(*rim_color); c.set_line_width(2*rim); c.stroke()
        c.restore()

def skip_next(c, cx, cy, h, color, r=0.08):
    """|> | glyph: play triangle + bar (the 'next' symbol)."""
    w = h*0.86; bar = h*0.20; gap = h*0.08; total = w + gap + bar
    x0 = cx - total/2
    c.set_source_rgb(*color)
    rpoly(c, [(x0, cy-h/2), (x0+w, cy), (x0, cy+h/2)], r*h); c.fill()
    rr(c, x0+w+gap, cy-h/2, bar, h, bar*0.28); c.fill()

def ffwd(c, cx, cy, h, color, r=0.08):
    w = h*0.78; step = w*0.78; total = w + step; x0 = cx - total/2
    c.set_source_rgb(*color)
    for k in range(2):
        xs = x0 + k*step
        rpoly(c, [(xs, cy-h/2), (xs+w, cy), (xs, cy+h/2)], r*h); c.fill()

def rr(c, x, y, w, h, r):
    c.new_sub_path()
    c.arc(x+w-r, y+r, r, -math.pi/2, 0); c.arc(x+w-r, y+h-r, r, 0, math.pi/2)
    c.arc(x+r, y+h-r, r, math.pi/2, math.pi); c.arc(x+r, y+r, r, math.pi, 1.5*math.pi)
    c.close_path()

def text_centered(c, s, cx, cy, cap_h, color, font='Noto Sans JP Black'):
    c.select_font_face(font, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
    c.set_font_size(100); e = c.text_extents(s); size = 100*cap_h/e.height
    c.set_font_size(size); e = c.text_extents(s)
    c.set_source_rgb(*color); c.move_to(cx - e.width/2 - e.x_bearing, cy - e.height/2 - e.y_bearing); c.show_text(s)

def bg(c, S, color): c.set_source_rgb(*color); c.rectangle(0, 0, S, S); c.fill()

def grad_bg(c, S):
    g = cairo.LinearGradient(0, 0, S*0.35, S); g.add_color_stop_rgb(0, *RED_HI); g.add_color_stop_rgb(1, *RED_LO)
    c.set_source(g); c.rectangle(0, 0, S, S); c.fill()

# ---------------------------------------------------------------- variants
def v_badge(c, S):   # the 0.1/0.2 icon, kept for comparison
    bg(c, S, BLACK); w = 0.80*S; cx, cy = S*0.48, S*0.46
    c.set_source_rgb(*RED); tube_path(c, cx, cy, w); c.fill()
    play(c, cx + w*0.03, cy, w/ASPECT*0.50, WHITE)
    bh, bw = 0.235*S, 0.40*S; bx, by = S*0.95-bw, cy + w/ASPECT/2 - bh*0.45; ring = 0.035*S
    c.set_source_rgb(*BLACK); rr(c, bx-ring, by-ring, bw+2*ring, bh+2*ring, (bh+2*ring)/2); c.fill()
    c.set_source_rgb(*WHITE); rr(c, bx, by, bw, bh, bh/2); c.fill()
    text_centered(c, 'NG', bx+bw/2, by+bh/2, bh*0.56, BLACK)

def v_next(c, S):    # red tube + skip-next glyph on true black
    bg(c, S, BLACK); w = 0.82*S
    c.set_source_rgb(*RED); tube_path(c, S/2, S/2, w); c.fill()
    skip_next(c, S/2, S/2, w/ASPECT*0.50, WHITE)

def v_outline(c, S): # OLED outline
    # The red rim on the triangle is for monochrome launchers (Hearth "dark mono", see
    # hearth_mono below): they keep what matches the tube's brightness, so a plain white
    # triangle was cut down to a faint pixel outline, while a red rim stays a clean outline.
    bg(c, S, BLACK); w = 0.80*S; lw = 0.055*S
    c.set_source_rgb(*RED); c.set_line_width(lw); tube_path(c, S/2, S/2, w - lw); c.stroke()
    play(c, S/2 + 0.01*S, S/2, w/ASPECT*0.525, WHITE, r=0.10, rim=0.035*S, rim_color=RED)

def v_ffwd(c, S):
    bg(c, S, BLACK); w = 0.82*S
    c.set_source_rgb(*RED); tube_path(c, S/2, S/2, w); c.fill()
    ffwd(c, S/2, S/2, w/ASPECT*0.44, WHITE)

def v_cutout(c, S):  # black triangle cut out of a red tube
    bg(c, S, BLACK); w = 0.82*S
    c.set_source_rgb(*RED); tube_path(c, S/2, S/2, w); c.fill()
    play(c, S/2 + 0.015*S, S/2, w/ASPECT*0.50, BLACK, r=0.06)

def v_progress(c, S):
    bg(c, S, BLACK); w = 0.66*S; cy = S*0.40
    c.set_source_rgb(*RED); tube_path(c, S/2, cy, w); c.fill()
    play(c, S/2 + 0.01*S, cy, w/ASPECT*0.48, WHITE, r=0.06)
    ty = S*0.80; th = 0.055*S; x0, x1 = S*0.14, S*0.86; frac = 0.62
    c.set_source_rgb(*RING); rr(c, x0, ty-th/2, x1-x0, th, th/2); c.fill()
    c.set_source_rgb(*RED); rr(c, x0, ty-th/2, (x1-x0)*frac, th, th/2); c.fill()
    c.arc(x0+(x1-x0)*frac, ty, 0.065*S, 0, 2*math.pi); c.fill()

def shield_path(c, cx, top, w, h):
    l, r = cx - w/2, cx + w/2; bot = top + h; k = 0.10*w
    c.move_to(l + k, top); c.line_to(r - k, top)
    c.curve_to(r - k*0.3, top, r, top + k*0.3, r, top + k)
    c.line_to(r, top + h*0.42)
    c.curve_to(r, top + h*0.72, cx + w*0.18, bot - h*0.08, cx, bot)
    c.curve_to(cx - w*0.18, bot - h*0.08, l, top + h*0.72, l, top + h*0.42)
    c.line_to(l, top + k); c.curve_to(l, top + k*0.3, l + k*0.3, top, l + k, top); c.close_path()

def v_shield(c, S):
    bg(c, S, BLACK); w, h = 0.66*S, 0.80*S
    c.set_source_rgb(*RED); shield_path(c, S/2, 0.09*S, w, h); c.fill()
    play(c, S/2 + 0.012*S, 0.09*S + h*0.43, 0.30*S, WHITE, r=0.08)

def v_tile(c, S):    # red gradient tile + big white skip-next
    grad_bg(c, S); skip_next(c, S/2, S/2, 0.46*S, WHITE, r=0.10)

def v_disc(c, S):
    bg(c, S, BLACK)
    c.set_source_rgb(*RED); c.arc(S/2, S/2, 0.40*S, 0, 2*math.pi); c.fill()
    skip_next(c, S/2 + 0.005*S, S/2, 0.33*S, WHITE, r=0.08)

VARIANTS = {
    'A': ('Бейдж NG (0.1–0.2)', v_badge, '#000000'),
    'B': ('Next ▶|', v_next, '#000000'),
    'C': ('Контур OLED', v_outline, '#000000'),
    'D': ('Перемотка ▶▶', v_ffwd, '#000000'),
    'E': ('Вырез', v_cutout, '#000000'),
    'F': ('Прогресс-бар', v_progress, '#000000'),
    'G': ('Щит (без рекламы)', v_shield, '#000000'),
    'H': ('Красная плитка ▶|', v_tile, '#D9221F'),
    'I': ('Круг ▶|', v_disc, '#000000'),
}

def render_png(fn, S, path):
    s = cairo.ImageSurface(cairo.FORMAT_ARGB32, S, S); c = cairo.Context(s)
    c.set_antialias(cairo.ANTIALIAS_BEST)
    fo = cairo.FontOptions(); fo.set_antialias(cairo.ANTIALIAS_GRAY); fo.set_hint_style(cairo.HINT_STYLE_NONE); fo.set_hint_metrics(cairo.HINT_METRICS_OFF)
    c.set_font_options(fo); fn(c, S); s.write_to_png(path)

def render_svg(fn, path, S=512):
    s = cairo.SVGSurface(path, S, S); c = cairo.Context(s); fn(c, S); s.finish()

def settings_thumb(fn):
    """Picture of the 'YouTube Next-Gen' item in YouTube's own Settings screen: the app icon in
    a disc with a hairline ring, so it still reads on YouTube's near-black background."""
    def draw(c, S):
        c.save(); c.arc(S/2, S/2, S/2, 0, 2*math.pi); c.clip()
        bg(c, S, BLACK); k = 0.86
        c.translate(S*(1-k)/2, S*(1-k)/2); c.scale(k, k); fn(c, S); c.restore()
        lw = max(2.0, 0.009*S); c.set_source_rgb(*RING); c.set_line_width(lw)
        c.arc(S/2, S/2, S/2 - lw/2, 0, 2*math.pi); c.stroke()
    return draw

def stock_youtube(c, S):
    """Stand-in for the stock YouTube tile in the LG launcher (white tile, classic logo)."""
    bg(c, S, WHITE); w = 0.62*S
    c.set_source_rgb(*RED); tube_path(c, S/2, S/2, w); c.fill()
    play(c, S/2 + 0.01*S, S/2, w/ASPECT*0.50, WHITE)

def save_png(path, im, colors=None):
    """Write an optimised PNG; with colors, as an adaptive palette (keeps alpha)."""
    from PIL import Image
    if colors:
        im = im.convert('RGBA').quantize(colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    im.save(path, optimize=True)

def cairo_image(fn, S, H=None):
    from PIL import Image
    H = H or S
    s = cairo.ImageSurface(cairo.FORMAT_ARGB32, S, H); c = cairo.Context(s)
    c.set_antialias(cairo.ANTIALIAS_BEST); fn(c, S); s.flush()
    return Image.frombuffer('RGBA', (S, H), bytes(s.get_data()), 'raw', 'BGRa', s.get_stride(), 1).copy()

def relative_luminance(rgb):
    ch = [x/12.92 if x <= 0.03928 else ((x+0.055)/1.055)**2.4 for x in rgb]
    return 0.2126*ch[0] + 0.7152*ch[1] + 0.0722*ch[2]

def hearth_mono(im):
    """The icon as Hearth's "dark mono" style draws it: a port of monoPixels() in Hearth 2.0.2
    src/lib/monoicon.ts (github.com/rudra-avatar/Hearth). Returns the white shape's alpha (L)."""
    import numpy as np
    from PIL import Image
    a = np.asarray(im.convert('RGBA').resize((128, 128), Image.Resampling.BILINEAR), dtype=float)
    ring = np.zeros(a.shape[:2], bool); ring[:2, :] = ring[-2:, :] = ring[:, :2] = ring[:, -2:] = True
    edge = a[ring]; opaque = edge[edge[:, 3] >= 128]
    if (edge[:, 3] < 128).mean() >= 0.5 or not len(opaque):
        s = a[..., 3] / 255                                   # transparent icon: its own shape
    else:
        bgc = [np.sort(opaque[:, k])[len(opaque) >> 1] for k in range(3)]
        d = np.sqrt(((a[..., :3] - bgc)**2).sum(axis=2)) / 441.7
        s = np.clip((d - 0.08) / 0.32, 0, 1); s[a[..., 3] < 128] = 0
    lum = (a[..., :3] @ [0.2126, 0.7152, 0.0722]) / 255
    strong = s >= 0.5; body = 0.5
    if strong.any():                                          # median brightness of the shape
        bins = np.bincount(np.minimum(63, (lum[strong]*64).astype(int)), minlength=64)
        body = (int(np.argmax(np.cumsum(bins) >= strong.sum()*0.5)) + 0.5) / 64
    cut = np.clip((np.abs(lum - body) - 0.18) / 0.14, 0, 1)  # other brightness = a hole
    s = np.where(strong, s*(1 - cut), s)
    return Image.fromarray(np.round(s*255).astype(np.uint8), 'L')

def squint_distance(a, b, n=12):
    """How different two icons look from across the room: mean RGB distance (0..100) of
    12x12 downscales. Used to check that the icon cannot be confused with stock YouTube."""
    import numpy as np
    from PIL import Image
    fa = np.asarray(a.convert('RGB').resize((n, n), Image.Resampling.BOX), dtype=float)
    fb = np.asarray(b.convert('RGB').resize((n, n), Image.Resampling.BOX), dtype=float)
    return float(np.sqrt(((fa - fb)**2).sum(axis=2)).mean() / (255*math.sqrt(3)) * 100)


if __name__ == '__main__':
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
    choice = (sys.argv[1] if len(sys.argv) > 1 else 'C').upper()
    if choice not in VARIANTS:
        sys.exit('Usage: python3 design/icons/generate.py [' + '|'.join(VARIANTS) + ']')
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.join(here, '..', '..')
    assets = os.path.join(root, 'assets')
    bold = '/usr/share/fonts/google-noto-cjk/NotoSansJP-Bold.otf'
    regular = '/usr/share/fonts/google-noto-cjk/NotoSansJP-Regular.otf'

    for k, (name, fn, color) in VARIANTS.items():
        d = os.path.join(here, k); os.makedirs(d, exist_ok=True)
        save_png(os.path.join(d, 'icon.png'), cairo_image(fn, 80))
        save_png(os.path.join(d, 'largeIcon.png'), cairo_image(fn, 130))
        render_svg(fn, os.path.join(d, 'icon.svg'))
        with open(os.path.join(d, 'variant.json'), 'w') as f:
            json.dump({'name': name, 'iconColor': color}, f, ensure_ascii=False); f.write('\n')

    # ---- what the app ships, for the chosen variant
    name, fn, color = VARIANTS[choice]
    for file in ('icon.png', 'largeIcon.png'):
        with open(os.path.join(here, choice, file), 'rb') as a, open(os.path.join(assets, file), 'wb') as b:
            b.write(a.read())
    appinfo = os.path.join(assets, 'appinfo.json')
    raw = open(appinfo, 'rb').read().decode('utf-8')
    import re
    raw = re.sub(r'("iconColor":\s*")[^"]*"', lambda m: m.group(1) + color + '"', raw)
    open(appinfo, 'wb').write(raw.encode('utf-8'))
    # Settings picture: shown at 240 px; inlined into the script, so a small palette PNG.
    save_png(os.path.join(root, 'src', 'icons', 'settings-entry.png'), cairo_image(settings_thumb(fn), 240), colors=64)
    # bgImage (launcher preview): black, the mark and the title.
    def preview(c, W):
        bg(c, W, BLACK)
        c.save(); c.translate(960 - 210, 430 - 210); c.scale(420/512, 420/512); fn(c, 512); c.restore()
        text_centered(c, 'YouTube Next-Gen', 960, 745, 58, WHITE, font='Noto Sans JP Bold')
    pv = cairo_image(lambda c, S: preview(c, S), 1920, 1080)
    save_png(os.path.join(assets, 'preview.png'), pv, colors=32)
    # splashBackground: the same picture. src/oled-true-black.css also puts it on YouTube's
    # start-up screen, so launch reads as one screen: TV splash, then YouTube booting.
    save_png(os.path.join(assets, 'splash.png'), pv, colors=32)

    # ---- comparison sheet: each variant at 260 / 130 / 80 px
    def put(dst, im, radius, xy):
        m = Image.new('L', im.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, im.size[0]-1, im.size[1]-1), radius, fill=255)
        dst.paste(im, xy, m)
    cols = 3; cw, ch = 470, 330
    rows = (len(VARIANTS) + cols - 1)//cols
    sheet = Image.new('RGB', (cols*cw + 20, rows*ch + 20), (18, 18, 18)); dr = ImageDraw.Draw(sheet)
    f, fs = ImageFont.truetype(bold, 24), ImageFont.truetype(regular, 17)
    for i, (k, (nm, vf, _)) in enumerate(VARIANTS.items()):
        x, y = 20 + (i % cols)*cw, 20 + (i//cols)*ch
        mark = '  ← выбран' if k == choice else ''
        dr.text((x, y), f'{k} — {nm}{mark}', font=f, fill=(255, 255, 255) if mark else (225, 225, 225))
        put(sheet, cairo_image(vf, 230), 24, (x, y + 44))
        put(sheet, cairo_image(vf, 130), 14, (x + 245, y + 44))
        put(sheet, cairo_image(vf, 80), 9, (x + 245 + 140, y + 44))
        dr.text((x + 245, y + 182), '130 px', font=fs, fill=(140, 140, 140))
        dr.text((x + 385, y + 130), '80 px', font=fs, fill=(140, 140, 140))
    sheet.save(os.path.join(here, 'variants.png'), optimize=True)

    # ---- launcher context: next to the stock YouTube tile, at 80 px, blurred ("squint") and grey
    tiles = [('YouTube\n(штатный)', stock_youtube)] + [(f'{k}', vf) for k, (_, vf, _) in VARIANTS.items()]
    T, gap = 140, 30; W = len(tiles)*(T + gap) + 50; H = 760
    mock = Image.new('RGB', (W, H)); md = ImageDraw.Draw(mock)
    for yy in range(H):  # webOS-like dark wallpaper
        t = yy/H; md.line([(0, yy), (W, yy)], fill=(int(28 - 14*t), int(32 - 16*t), int(44 - 22*t)))
    fl = ImageFont.truetype(bold, 20)
    md.text((40, 18), 'Лаунчер LG (имитация): ряд приложений · 80 px · «прищур» (размытие) · без цвета · Hearth «тёмный моно»', font=fs, fill=(170, 175, 185))
    for i, (label, vf) in enumerate(tiles):
        x = 40 + i*(T + gap)
        big = cairo_image(vf, T)
        put(mock, big, 18, (x, 60))
        md.multiline_text((x + T/2, 60 + T + 10), label, font=fl, fill=(230, 230, 230), anchor='ma', align='center')
        small = cairo_image(vf, 80); put(mock, small, 9, (x + (T - 80)//2, 280))
        blur = cairo_image(vf, 80).convert('RGB').resize((20, 20), Image.Resampling.BOX).resize((80, 80), Image.Resampling.BICUBIC)
        put(mock, blur, 9, (x + (T - 80)//2, 390))
        grey = cairo_image(vf, 80).convert('L').convert('RGB'); put(mock, grey, 9, (x + (T - 80)//2, 500))
        mono = hearth_mono(cairo_image(vf, 130)).resize((100, 100), Image.Resampling.BILINEAR)
        tile = Image.new('RGB', (100, 100), (22, 24, 46)); tile.paste((245, 245, 255), (0, 0), mono)
        put(mock, tile, 12, (x + (T - 100)//2, 610))
    mock.save(os.path.join(here, 'launcher.png'), optimize=True)

    # ---- numbers for the write-up
    stock = cairo_image(stock_youtube, 80)
    print('variant  squint-distance-from-stock-YouTube')
    for k, (nm, vf, _) in VARIANTS.items():
        print(f'  {k}  {squint_distance(cairo_image(vf, 80), stock):5.1f}  {nm}')
    print(f'chosen {choice}: assets/ icons, iconColor {color}, preview.png, splash.png, settings-entry.png written')
