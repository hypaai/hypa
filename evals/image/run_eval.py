"""Image evaluation: read the text -> translate it -> edit the image with an exact replacement list -> score.

usage: python run_eval.py <stage> <workdir> [options]
  stages: ocr | mt | edit | judge | report
  --images N        use only the first N images
  --langs fr,yo,ef,ha
  --models a,b,c
  --workers N
  --images-dir PATH   the images and manifest.json (default: ./images)
Keys come from the environment (META_MODEL_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY,
GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION) and are never printed. Everything is cached
under <workdir>, so a stopped run resumes where it left off.
"""

import argparse
import base64
import concurrent.futures as cf
import json
import os
import re
import statistics as st
import sys
import time
import urllib.error
import urllib.request
import uuid

ap = argparse.ArgumentParser()
ap.add_argument("stage")
ap.add_argument("work")
ap.add_argument("--images", type=int)
ap.add_argument("--langs", default="fr,yo,ef,ha")
ap.add_argument("--models", default="muse-image-1.0,gpt-image-2.5-sunburst,gemini-nano-banana-2.1,gemini-3-pro-image")
ap.add_argument("--workers", type=int, default=4)
ap.add_argument("--images-dir", default="images")
args = ap.parse_args()

IMAGES = args.images_dir
W = args.work
os.makedirs(W, exist_ok=True)
LANGS = args.langs.split(",")
MODELS = args.models.split(",")
LANG_NAMES = {"fr": "French", "yo": "Yoruba", "ef": "Efik", "ha": "Hausa"}
ENV = dict(os.environ)
MANIFEST = json.load(open(os.path.join(IMAGES, "manifest.json"), encoding="utf-8"))
if args.images:
    MANIFEST = MANIFEST[: args.images]


def jload(path, default=None):
    return json.load(open(path, encoding="utf-8")) if os.path.exists(path) else default


def jsave(path, data):
    json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def post(url, headers, data, timeout=300):
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:200]}")


def img_b64(path):
    return base64.b64encode(open(path, "rb").read()).decode()


def muse(messages, max_tokens=8000):
    """Muse Spark 1.3 chat (the model the platform serves for the meta provider)."""
    res = post(
        "https://api.meta.ai/v1/chat/completions",
        {"Authorization": f"Bearer {ENV['META_MODEL_API_KEY']}", "Content-Type": "application/json"},
        json.dumps({"model": "muse-spark-1.3", "messages": messages, "max_tokens": max_tokens}).encode(),
    )
    text = res["choices"][0]["message"]["content"] or ""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()


def parse_json(text, opener):
    closer = "]" if opener == "[" else "}"
    s, e = text.find(opener), text.rfind(closer)
    return json.loads(text[s : e + 1])


def norm(s):
    return re.sub(r"[^\w]+", "", s.lower())


# ---------------------------------------------------------------- stage: ocr
def stage_ocr():
    out = {}
    path = os.path.join(W, "ocr.json")
    out = jload(path, {})

    def one(item):
        if item["file"] in out:
            return
        text = muse([{"role": "user", "content": [
            {"type": "text", "text": "List every separate piece of text visible in this image, in reading order, one array item per line or label. Return only a JSON array of strings."},
            {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + img_b64(os.path.join(IMAGES, item["file"]))}},
        ]}])
        out[item["file"]] = parse_json(text, "[")

    with cf.ThreadPoolExecutor(args.workers) as ex:
        list(ex.map(one, MANIFEST))
    jsave(path, out)
    hit = total = 0
    for item in MANIFEST:
        got = {norm(x) for x in out[item["file"]]}
        for s in item["strings"]:
            total += 1
            hit += norm(s) in got
    print(f"OCR: {len(out)} images, {hit}/{total} source strings read exactly ({hit / total:.0%})")


# ----------------------------------------------------------------- stage: mt
def mt_file():
    return os.path.join(W, "mt.json")


def stage_mt():
    ocr = jload(os.path.join(W, "ocr.json"))
    path = mt_file()
    out = jload(path, {})
    jobs = [(i["file"], l) for i in MANIFEST for l in LANGS if f"{i['file']}|{l}" not in out]

    def one(job):
        file, lang = job
        strings = ocr[file]
        text = muse([{"role": "user", "content": (
            f"Translate each of these short pieces of text from an image into {LANG_NAMES[lang]}. "
            "Keep them short, natural and correctly spelled, with all accents and tone marks. "
            "Keep numbers, prices and currency symbols unchanged. "
            f"Return only a JSON array of {len(strings)} strings in the same order.\n" + json.dumps(strings, ensure_ascii=False))}])
        arr = parse_json(text, "[")
        if len(arr) != len(strings):
            raise RuntimeError("length mismatch")
        out[f"{file}|{lang}"] = arr

    with cf.ThreadPoolExecutor(args.workers) as ex:
        for job, res in zip(jobs, ex.map(lambda j: _safe(one, j), jobs)):
            if res:
                print("MT FAIL", job, res)
    jsave(path, out)
    print(f"MT: {len(out)} image-language pairs")


def _safe(fn, arg):
    try:
        fn(arg)
    except Exception as e:  # noqa: BLE001
        return str(e)[:150]


# --------------------------------------------------------------- stage: edit
def edit_prompt(sources, targets, lang):
    pairs = "\n".join(f'{i + 1}. "{s}" -> "{t}"' for i, (s, t) in enumerate(zip(sources, targets)))
    return (
        f"Edit this image so that its text is in {LANG_NAMES[lang]}. Replace each piece of text exactly as listed, "
        "character for character, including every accent and tone mark. Do not translate anything yourself, "
        "do not add, remove or reword any text.\n"
        f"{pairs}\n"
        "Keep everything else identical: layout, positions, fonts, colours, background, borders and objects."
    )


def multipart(fields, files):
    boundary = uuid.uuid4().hex
    body = b""
    for k, v in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    for k, (fname, content, ctype) in files.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{fname}"\r\nContent-Type: {ctype}\r\n\r\n'.encode() + content + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def run_model(model, image_path, prompt):
    raw = open(image_path, "rb").read()
    b64 = base64.b64encode(raw).decode()
    started = time.time()
    if model == "muse-image-1.0":
        res = post("https://api.meta.ai/v1/images/edits",
                   {"Authorization": f"Bearer {ENV['META_MODEL_API_KEY']}", "Content-Type": "application/json"},
                   json.dumps({"model": model, "prompt": prompt, "images": [{"image_url": f"data:image/jpeg;base64,{b64}"}]}).encode())
        item = (res.get("data") or res.get("images"))[0]
        data = base64.b64decode(item["b64_json"]) if item.get("b64_json") else urllib.request.urlopen(item["image_url"], timeout=120).read()
        usage = res.get("usage")
    elif model.startswith("gemini"):
        url = (f"https://aiplatform.googleapis.com/v1/projects/{ENV['GOOGLE_CLOUD_PROJECT']}/locations/"
               f"{ENV['GOOGLE_CLOUD_LOCATION']}/publishers/google/models/{model}:generateContent")
        res = post(url, {"x-goog-api-key": ENV["GEMINI_API_KEY"], "Content-Type": "application/json"},
                   json.dumps({"contents": [{"role": "user", "parts": [{"text": prompt}, {"inlineData": {"mimeType": "image/jpeg", "data": b64}}]}],
                               "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"imageSize": "1K"}}}).encode())
        parts = res["candidates"][0]["content"]["parts"]
        data = base64.b64decode(next(p["inlineData"]["data"] for p in parts if "inlineData" in p))
        usage = res.get("usageMetadata")
    else:
        body, ctype = multipart({"model": model, "prompt": prompt, "size": "1024x1024", "quality": "medium", "output_format": "png"},
                                {"image[]": (os.path.basename(image_path), raw, "image/jpeg")})
        res = post("https://api.openai.com/v1/images/edits", {"Authorization": f"Bearer {ENV['OPENAI_API_KEY']}", "Content-Type": ctype}, body)
        data = base64.b64decode(res["data"][0]["b64_json"])
        usage = res.get("usage")
    return data, usage, time.time() - started


def stage_edit():
    ocr = jload(os.path.join(W, "ocr.json"))
    mt = jload(mt_file())
    os.makedirs(os.path.join(W, "out"), exist_ok=True)
    jobs = [(m, i["file"], l) for m in MODELS for l in LANGS for i in MANIFEST if f"{i['file']}|{l}" in mt]

    def one(job):
        model, file, lang = job
        stem = os.path.splitext(file)[0]
        base = os.path.join(W, "out", f"{model}__{lang}__{stem}")
        if os.path.exists(base + ".json") and jload(base + ".json").get("ok"):
            return
        rec = {"model": model, "lang": lang, "image": file}
        prompt = edit_prompt(ocr[file], mt[f"{file}|{lang}"], lang)
        delay = 20
        for attempt in range(6):
            try:
                data, usage, secs = run_model(model, os.path.join(IMAGES, file), prompt)
                open(base + ".png", "wb").write(data)
                rec.update(ok=True, usage=usage, seconds=round(secs, 1), prompt=prompt)
                break
            except Exception as e:  # noqa: BLE001
                rec.update(ok=False, error=str(e)[:300])
                if "429" in rec["error"] or "503" in rec["error"]:
                    time.sleep(delay)
                    delay = min(delay * 2, 240)
                else:
                    break
        jsave(base + ".json", rec)

    with cf.ThreadPoolExecutor(args.workers) as ex:
        list(ex.map(one, jobs))
    recs = [jload(os.path.join(W, "out", f)) for f in os.listdir(os.path.join(W, "out")) if f.endswith(".json")]
    for m in MODELS:
        rs = [r for r in recs if r["model"] == m]
        print(m, "ok", sum(r["ok"] for r in rs), "of", len(rs))


# --------------------------------------------------------------- stage: judge
JUDGE_PROMPT = """You are checking an image edit. Image 1 is the ORIGINAL. Image 2 is the RESULT.
The edit was meant to replace the original text with exactly these replacements:
{pairs}

Score the RESULT from 1 (very bad) to 5 (perfect) on:
- text_accuracy: does every replacement string appear exactly in the result, spelled exactly as given, including every accent and tone mark? 5 = all exact, 3 = about half right, 1 = most wrong or missing.
- fidelity: are the layout, positions, fonts, colours, background and objects unchanged from the original, apart from the text? A changed background colour or removed border is a big loss.
- leftovers: 5 = no original text left and no invented text; 1 = original text remains or extra text was invented.
Read the result carefully, letter by letter. Reply with only JSON: {{"text_accuracy": n, "fidelity": n, "leftovers": n, "note": "short reason"}}"""


def stage_judge():
    ocr = jload(os.path.join(W, "ocr.json"))
    mt = jload(mt_file())
    path = os.path.join(W, "judge.json")
    out = jload(path, {})
    outdir = os.path.join(W, "out")
    recs = [jload(os.path.join(outdir, f)) for f in sorted(os.listdir(outdir)) if f.endswith(".json")]
    recs = [r for r in recs if r["ok"] and r["model"] in MODELS and r["lang"] in LANGS]

    def judge_one(r):
        stem = os.path.splitext(r["image"])[0]
        key = f"{r['model']}__{r['lang']}__{stem}"
        if key in out:
            return
        pairs = "\n".join(f'"{s}" -> "{t}"' for s, t in zip(ocr[r["image"]], mt[f"{r['image']}|{r['lang']}"]))
        original = "data:image/jpeg;base64," + img_b64(os.path.join(IMAGES, r["image"]))
        result = "data:image/png;base64," + img_b64(os.path.join(outdir, key + ".png"))
        text = muse([{"role": "user", "content": [
            {"type": "text", "text": JUDGE_PROMPT.format(pairs=pairs)},
            {"type": "image_url", "image_url": {"url": original}},
            {"type": "image_url", "image_url": {"url": result}},
        ]}], max_tokens=8000)
        out[key] = parse_json(text, "{")

    with cf.ThreadPoolExecutor(args.workers) as ex:
        for r, res in zip(recs, ex.map(lambda r: _safe(judge_one, r), recs)):
            if res:
                print("JUDGE FAIL", r["model"], r["lang"], r["image"], res)
    jsave(path, out)
    print("judged", len(out))


# -------------------------------------------------------------- stage: report
PRICE = {"muse-image-1.0": 0.01}


def provider_cost(model, usage):
    if model == "muse-image-1.0":
        return 0.01
    if model.startswith("gpt"):
        d = usage["input_tokens_details"]
        return d["text_tokens"] * 5 / 1e6 + d["image_tokens"] * 8 / 1e6 + usage["output_tokens"] * 30 / 1e6
    det = usage["candidatesTokensDetails"]
    img = sum(x["tokenCount"] for x in det if x["modality"] == "IMAGE")
    txt = sum(x["tokenCount"] for x in det if x["modality"] == "TEXT") + usage.get("thoughtsTokenCount", 0)
    if model == "gemini-nano-banana-2.1":
        return usage["promptTokenCount"] * 1.5 / 1e6 + img * 30 / 1e6 + txt * 7.5 / 1e6
    return usage["promptTokenCount"] * 2 / 1e6 + img * 120 / 1e6 + txt * 12 / 1e6


def stage_report():
    judge = jload(os.path.join(W, "judge.json"), {})
    outdir = os.path.join(W, "out")
    recs = [jload(os.path.join(outdir, f)) for f in sorted(os.listdir(outdir)) if f.endswith(".json")]
    rows = []
    print("| Model | Runs ok | Reliability | Text accuracy | Fidelity | Leftovers | Avg cost | Avg time |")
    print("|---|---|---|---|---|---|---|---|")
    for m in MODELS:
        rs = [r for r in recs if r["model"] == m and r["lang"] in LANGS]
        ok = [r for r in rs if r["ok"]]
        scores = [judge[f"{m}__{r['lang']}__{os.path.splitext(r['image'])[0]}"] for r in ok
                  if f"{m}__{r['lang']}__{os.path.splitext(r['image'])[0]}" in judge]
        avg = lambda k: st.mean(s[k] for s in scores) if scores else float("nan")
        cost = st.mean(provider_cost(m, r["usage"]) for r in ok) if ok else float("nan")
        secs = st.mean(r["seconds"] for r in ok) if ok else float("nan")
        print(f"| {m} | {len(ok)}/{len(rs)} | {len(ok) / max(len(rs), 1):.0%} | {avg('text_accuracy'):.2f} | {avg('fidelity'):.2f} | {avg('leftovers'):.2f} | ${cost:.3f} | {secs:.0f} s |")
    print()
    for lang in LANGS:
        print(f"By language: {lang}", {
            m: round(st.mean(judge[k]["text_accuracy"] for k in judge if k.startswith(m + "__" + lang + "__")), 2)
            for m in MODELS if any(k.startswith(m + "__" + lang + "__") for k in judge)})


{"ocr": stage_ocr, "mt": stage_mt, "edit": stage_edit, "judge": stage_judge, "report": stage_report}[args.stage]()
