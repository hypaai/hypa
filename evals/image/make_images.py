"""Synthetic test images for the in-image translation evaluation.

usage: python make_images.py <output folder>

Every image is rendered here, so there are no rights or privacy issues. Each one
has English text and light real-world wear (tilt, blur, noise, JPEG). The
manifest lists the exact text on every image, in reading order, as ground truth.
"""

import json
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

if len(sys.argv) != 2:
    sys.exit("usage: python make_images.py <output folder>")
OUT = sys.argv[1]
FONT_DIRS = [
    "C:/Windows/Fonts/",
    "/System/Library/Fonts/Supplemental/",
    "/usr/share/fonts/truetype/msttcorefonts/",
    "/usr/share/fonts/truetype/liberation/",
    "/usr/share/fonts/truetype/dejavu/",
]
# Other fonts that look close enough, tried when the Windows name is missing.
FALLBACKS = {
    "arial.ttf": ["Arial.ttf", "LiberationSans-Regular.ttf", "DejaVuSans.ttf"],
    "arialbd.ttf": ["Arial Bold.ttf", "LiberationSans-Bold.ttf", "DejaVuSans-Bold.ttf"],
    "georgia.ttf": ["Georgia.ttf", "LiberationSerif-Regular.ttf", "DejaVuSerif.ttf"],
    "consola.ttf": ["Courier New.ttf", "LiberationMono-Regular.ttf", "DejaVuSansMono.ttf"],
    "impact.ttf": ["Impact.ttf", "LiberationSans-Bold.ttf", "DejaVuSans-Bold.ttf"],
    "segoeui.ttf": ["Arial.ttf", "LiberationSans-Regular.ttf", "DejaVuSans.ttf"],
    "segoeuib.ttf": ["Arial Bold.ttf", "LiberationSans-Bold.ttf", "DejaVuSans-Bold.ttf"],
}
os.makedirs(OUT, exist_ok=True)
rng = random.Random(7)
nrng = np.random.default_rng(7)


def font(name, size):
    for directory in FONT_DIRS:
        for candidate in [name] + FALLBACKS.get(name, []):
            try:
                return ImageFont.truetype(directory + candidate, size)
            except OSError:
                continue
    return ImageFont.load_default(size)


def center(draw, y, text, fnt, fill, width):
    box = draw.textbbox((0, 0), text, font=fnt)
    draw.text(((width - (box[2] - box[0])) // 2, y), text, font=fnt, fill=fill)
    return y + (box[3] - box[1])


def wear(img, tilt=2.0, blur=0.5, noise=6.0):
    """Tilt, soften, add sensor noise: closer to a phone photo than a clean render."""
    angle = rng.uniform(-tilt, tilt)
    img = img.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=(70, 70, 70))
    img = img.filter(ImageFilter.GaussianBlur(rng.uniform(blur * 0.5, blur)))
    arr = np.asarray(img).astype(np.float32)
    arr += nrng.normal(0, noise, arr.shape)
    h, w = arr.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    vignette = 1 - 0.18 * (((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) / 2
    arr *= vignette[..., None] * rng.uniform(0.93, 1.05)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


manifest = []


def save(name, kind, strings, img, **wear_args):
    path = os.path.join(OUT, f"{name}.jpg")
    wear(img, **wear_args).save(path, quality=88)
    manifest.append({"file": f"{name}.jpg", "kind": kind, "strings": strings})


def sign(name, bg, fg, lines, border=None, size=(1100, 700)):
    img = Image.new("RGB", size, bg)
    d = ImageDraw.Draw(img)
    if border:
        d.rounded_rectangle((20, 20, size[0] - 20, size[1] - 20), radius=30, outline=border, width=14)
    y = 110
    for text, name_font, px in lines:
        y = center(d, y, text, font(name_font, px), fg_for(fg, text), size[0]) + 55
    save(name, "sign", [t for t, _, _ in lines], img)


def fg_for(fg, _text):
    return fg


# --- signs --------------------------------------------------------------------
fg = (255, 255, 255)
sign("01_road_closed", (200, 30, 30), fg, [("ROAD CLOSED", "arialbd.ttf", 120), ("NO ENTRY", "arialbd.ttf", 90), ("Use the next left turn", "arial.ttf", 48)], border=(255, 255, 255))
sign("02_bus_stop", (20, 80, 160), fg, [("BUS STOP", "arialbd.ttf", 130), ("Route 12", "arialbd.ttf", 80), ("to Central Market", "arial.ttf", 60)], border=(255, 255, 255))
sign("03_welcome", (20, 110, 60), fg, [("WELCOME TO LAGOS", "arialbd.ttf", 100), ("Please drive safely", "arial.ttf", 64), ("Speed limit 50", "arialbd.ttf", 70)], border=(255, 255, 255))
fg = (30, 30, 30)
sign("04_shop_open", (250, 230, 120), fg, [("OPEN", "impact.ttf", 170), ("Monday to Saturday", "arial.ttf", 60), ("8am to 6pm", "arialbd.ttf", 80)], border=(30, 30, 30))
sign("05_pharmacy", (235, 245, 235), (20, 110, 60), [("PHARMACY", "arialbd.ttf", 130), ("Prescriptions filled here", "arial.ttf", 60), ("Open every day", "arialbd.ttf", 60)], border=(20, 110, 60))
sign("06_bakery", (255, 244, 225), (140, 70, 20), [("FRESH BREAD", "georgia.ttf", 120), ("Baked every morning", "georgia.ttf", 66), ("Buy two, get one free", "georgia.ttf", 56)], border=(140, 70, 20))


# --- menus --------------------------------------------------------------------
def menu(name, title, items, bg=(252, 247, 235), ink=(60, 35, 20), size=(900, 1200)):
    img = Image.new("RGB", size, bg)
    d = ImageDraw.Draw(img)
    y = 70
    y = center(d, y, title, font("georgia.ttf", 78), ink, size[0]) + 50
    strings = [title]
    for label, price in items:
        d.text((90, y), label, font=font("georgia.ttf", 46), fill=ink)
        d.text((size[0] - 230, y), price, font=font("georgia.ttf", 46), fill=ink)
        strings += [label, price]
        y += 82
    save(name, "menu", strings, img)


menu("07_restaurant_menu", "Today's Menu", [("Jollof rice with chicken", "N3,500"), ("Pounded yam and egusi soup", "N4,000"), ("Grilled fish with plantain", "N4,500"), ("Pepper soup", "N2,500"), ("Fresh fruit salad", "N1,800"), ("Bottled water", "N500")])
menu("08_cafe_board", "Cafe Menu", [("Hot coffee", "N1,200"), ("Fresh orange juice", "N1,500"), ("Chicken sandwich", "N2,800"), ("Chocolate cake", "N2,000")], bg=(40, 44, 40), ink=(245, 245, 235))
menu("09_special", "Special Offer", [("Rice and stew", "N2,000"), ("Free drink with every meal", ""), ("Offer ends on Friday", "")], bg=(255, 236, 200), ink=(150, 30, 30))


# --- receipts -------------------------------------------------------------------
def receipt(name, store, lines, total):
    size = (700, 1000)
    img = Image.new("RGB", size, (250, 250, 247))
    d = ImageDraw.Draw(img)
    y = 40
    strings = []
    y = center(d, y, store, font("consola.ttf", 44), (20, 20, 20), size[0]) + 30
    strings.append(store)
    for label, price in lines:
        d.text((50, y), label, font=font("consola.ttf", 30), fill=(20, 20, 20))
        d.text((size[0] - 200, y), price, font=font("consola.ttf", 30), fill=(20, 20, 20))
        strings += [label, price]
        y += 52
    d.line((50, y + 8, size[0] - 50, y + 8), fill=(20, 20, 20), width=3)
    y += 30
    for label, price in (("Total", total), ("Paid in cash", total)):
        d.text((50, y), label, font=font("consola.ttf", 34), fill=(20, 20, 20))
        d.text((size[0] - 200, y), price, font=font("consola.ttf", 34), fill=(20, 20, 20))
        strings += [label, price]
        y += 56
    y = center(d, y + 40, "Thank you for shopping with us", font("consola.ttf", 26), (20, 20, 20), size[0])
    strings.append("Thank you for shopping with us")
    save(name, "receipt", strings, img, tilt=2.5)


receipt("10_grocery_receipt", "GREEN MARKET", [("Rice 5kg", "6,500"), ("Cooking oil 1L", "2,400"), ("Tomatoes", "1,200"), ("Bread", "900"), ("Milk 500ml", "1,100")], "12,100")
receipt("11_pharmacy_receipt", "CITY PHARMACY", [("Paracetamol 500mg", "800"), ("Vitamin C tablets", "1,500"), ("Bandages", "600"), ("Hand sanitiser", "1,000")], "3,900")


# --- forms ----------------------------------------------------------------------
def form(name, title, fields, size=(900, 1200)):
    img = Image.new("RGB", size, (255, 255, 255))
    d = ImageDraw.Draw(img)
    y = 60
    y = center(d, y, title, font("arialbd.ttf", 56), (20, 40, 110), size[0]) + 60
    strings = [title]
    for label in fields:
        d.text((70, y), label, font=font("arial.ttf", 38), fill=(30, 30, 30))
        d.line((70, y + 62, size[0] - 70, y + 62), fill=(120, 120, 120), width=2)
        strings.append(label)
        y += 120
    save(name, "form", strings, img, tilt=1.5)


form("12_registration_form", "Registration Form", ["Full name", "Date of birth", "Home address", "Phone number", "Occupation", "Signature"])
form("13_clinic_form", "Clinic Visit Form", ["Reason for visit", "Allergies", "Current medicines", "Emergency contact", "Date"])


# --- medicine labels ----------------------------------------------------------------
def label(name, title, lines, colour):
    size = (1000, 700)
    img = Image.new("RGB", size, (250, 250, 250))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, size[0], 130), fill=colour)
    center(d, 28, title, font("arialbd.ttf", 68), (255, 255, 255), size[0])
    y = 170
    strings = [title]
    for text, name_font, px in lines:
        d.text((60, y), text, font=font(name_font, px), fill=(20, 20, 20))
        strings.append(text)
        y += px + 34
    save(name, "medicine_label", strings, img, tilt=2.0)


label("14_paracetamol", "PARACETAMOL 500 mg", [("Take 2 tablets every 8 hours", "arialbd.ttf", 50), ("Do not take more than 8 tablets in 24 hours", "arial.ttf", 40), ("Keep out of reach of children", "arial.ttf", 40), ("Store in a cool dry place", "arial.ttf", 40)], (30, 90, 160))
label("15_antibiotic", "AMOXICILLIN 250 mg", [("Take one capsule three times a day", "arialbd.ttf", 48), ("Take after meals", "arial.ttf", 42), ("Finish the full course", "arial.ttf", 42), ("Do not share this medicine", "arial.ttf", 42)], (150, 40, 60))


# --- posters ------------------------------------------------------------------------
def poster(name, bg, ink, lines, size=(900, 1200)):
    img = Image.new("RGB", size, bg)
    d = ImageDraw.Draw(img)
    y = 110
    strings = []
    for text, name_font, px in lines:
        y = center(d, y, text, font(name_font, px), ink, size[0]) + 60
        strings.append(text)
    save(name, "poster", strings, img, tilt=2.5)


poster("16_health_day", (255, 245, 200), (20, 90, 60), [("COMMUNITY", "impact.ttf", 110), ("HEALTH DAY", "impact.ttf", 110), ("Free check-ups for everyone", "arialbd.ttf", 52), ("Saturday at 9am", "arial.ttf", 56), ("Town Hall", "arialbd.ttf", 64)])
poster("17_clean_water", (200, 230, 250), (10, 60, 120), [("CLEAN WATER", "impact.ttf", 120), ("FOR ALL", "impact.ttf", 120), ("Wash your hands with soap", "arialbd.ttf", 54), ("Before you eat", "arial.ttf", 56)])


# --- phone screenshots ---------------------------------------------------------------
def chat_screen(name):
    size = (700, 1300)
    img = Image.new("RGB", size, (236, 229, 221))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, size[0], 120), fill=(7, 94, 84))
    d.text((40, 38), "Market Group", font=font("segoeuib.ttf", 44), fill=(255, 255, 255))
    strings = ["Market Group"]
    y = 170
    for text, mine in (("Good morning everyone", False), ("Is the market open today?", False), ("Yes, we open at 8am", True), ("Please bring your own bags", True), ("Thank you, see you soon", False)):
        box = d.textbbox((0, 0), text, font=font("segoeui.ttf", 36))
        w = box[2] - box[0] + 60
        x = size[0] - w - 30 if mine else 30
        d.rounded_rectangle((x, y, x + w, y + 90), radius=24, fill=(220, 248, 198) if mine else (255, 255, 255))
        d.text((x + 30, y + 22), text, font=font("segoeui.ttf", 36), fill=(20, 20, 20))
        strings.append(text)
        y += 125
    save(name, "phone_screenshot", strings, img, tilt=0.6, blur=0.3, noise=2.0)


def settings_screen(name):
    size = (700, 1300)
    img = Image.new("RGB", size, (245, 245, 247))
    d = ImageDraw.Draw(img)
    d.text((40, 60), "Settings", font=font("segoeuib.ttf", 60), fill=(20, 20, 20))
    strings = ["Settings"]
    y = 190
    for text in ("Notifications", "Language", "Dark mode", "Privacy", "Storage", "Help and support"):
        d.rounded_rectangle((30, y, size[0] - 30, y + 110), radius=20, fill=(255, 255, 255))
        d.text((70, y + 28), text, font=font("segoeui.ttf", 40), fill=(20, 20, 20))
        strings.append(text)
        y += 140
    save(name, "phone_screenshot", strings, img, tilt=0.6, blur=0.3, noise=2.0)


chat_screen("18_chat_screenshot")
settings_screen("19_settings_screenshot")

# --- warning notice --------------------------------------------------------------------
sign("20_wet_floor", (255, 205, 0), (20, 20, 20), [("CAUTION", "impact.ttf", 150), ("WET FLOOR", "impact.ttf", 120), ("Staff only beyond this point", "arialbd.ttf", 50)], border=(20, 20, 20))

json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)
kinds = {}
for item in manifest:
    kinds[item["kind"]] = kinds.get(item["kind"], 0) + 1
print(f"{len(manifest)} images written to {OUT}")
print("by kind:", kinds)
print("strings in total:", sum(len(i["strings"]) for i in manifest))
