"""Frames real app screenshots for the Play Store (1080x1920, 24-bit PNG, brand navy + gold).

Usage:
  1. Take screenshots on a phone (test data only, no real numbers or home location).
  2. Save them in store_listing/raw/ named 01-sos.png, 02-setup.png, ... (order = store order).
  3. Edit CAPTIONS below if needed, then run:  python frame_screenshots.py
  4. Upload the files from store_listing/framed/ to Play Console.

Play policy: screenshots must show the real app. The frame only adds a caption.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = Path(__file__).parent
RAW, OUT = HERE / "raw", HERE / "framed"
W, H = 1080, 1920

# Caption per screenshot, matched by the number at the start of the file name
CAPTIONS = {
    "01": ("One press for help", "Tap for a 5-second countdown or hold to send"),
    "02": ("Your guardian in a minute", "They get your live location on WhatsApp"),
    "03": ("Clear about your privacy", "Location is shared only during an SOS"),
    "04": ("No account? No problem", "Use Instant SOS or sign in with your number"),
    "05": ("Never a false 'sent'", "DEVI tells you if an alert has not gone out"),
}

NAVY_TOP, NAVY_BOTTOM = (1, 7, 21), (11, 28, 69)
GOLD, TEXT_SOFT = (255, 181, 46), (230, 235, 247)


def font(names, size):
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


TITLE_FONT = font(["georgiab.ttf", "seguisb.ttf", "arialbd.ttf"], 74)
SUB_FONT = font(["segoeui.ttf", "arial.ttf"], 40)


def background():
    bg = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(bg)
    for y in range(H):
        t = y / (H - 1)
        draw.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(NAVY_TOP, NAVY_BOTTOM)))
    return bg


def centered(draw, y, text, fnt, fill):
    width = draw.textlength(text, font=fnt)
    draw.text(((W - width) / 2, y), text, font=fnt, fill=fill)


def frame(src: Path):
    title, sub = CAPTIONS.get(src.name[:2], ("", ""))
    canvas = background()
    draw = ImageDraw.Draw(canvas)
    centered(draw, 120, title, TITLE_FONT, GOLD)
    centered(draw, 220, sub, SUB_FONT, TEXT_SOFT)

    shot = Image.open(src).convert("RGB")
    max_w, max_h = 860, 1520
    scale = min(max_w / shot.width, max_h / shot.height)
    shot = shot.resize((round(shot.width * scale), round(shot.height * scale)), Image.LANCZOS)

    radius = 44
    mask = Image.new("L", shot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, shot.width - 1, shot.height - 1], radius, fill=255)
    x, y = (W - shot.width) // 2, H - shot.height - 80

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).rounded_rectangle([x - 6, y - 6, x + shot.width + 6, y + shot.height + 6],
                                           radius + 6, fill=GOLD + (150,))
    canvas.paste(glow.filter(ImageFilter.GaussianBlur(14)), (0, 0), glow.filter(ImageFilter.GaussianBlur(14)))
    canvas.paste(shot, (x, y), mask)

    OUT.mkdir(exist_ok=True)
    out = OUT / f"{src.stem}-1080x1920.png"
    canvas.save(out, optimize=True)  # RGB = 24-bit PNG without alpha, as Play requires
    print(f"OK {out.name}  ({title})")


if __name__ == "__main__":
    files = sorted(p for p in RAW.glob("*") if p.suffix.lower() in {".png", ".jpg", ".jpeg"})
    if not files:
        RAW.mkdir(exist_ok=True)
        print(f"Put phone screenshots in {RAW} (01-sos.png, 02-setup.png, ...) and run again.")
    for f in files:
        frame(f)
