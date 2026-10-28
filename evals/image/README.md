# Image evaluation: translating the text in a picture

This folder measures how well image models can replace the text in a picture with another language while leaving everything else alone. Think of a photo of a sign, a menu, a receipt or a medicine label that comes back identical, except that the words are in French, Yoruba, Efik or Hausa.

It compares the models behind `@hypa/localize-image`: Meta's Muse Image 1.0, Google's Nano Banana 2.1 and Gemini 3 Pro Image, and OpenAI's GPT Image 2.5.

## How a test works

Image models do not know every language well, so the model is never asked to translate. Each picture goes through four steps:

1. **Read.** A vision model lists every piece of text in the picture.
2. **Translate.** A translation model turns each piece into the target language.
3. **Edit.** The image model is given the picture and an exact list of replacements, such as `"NO ENTRY" -> "Má wọlé"`, and told to change nothing else.
4. **Score.** A vision model compares the original and the result against the replacement list, then rates three things from 1 (very bad) to 5 (perfect):
   - **Text accuracy:** does every replacement appear exactly as given, including every accent and tone mark?
   - **Fidelity:** are the layout, fonts, colours, background and objects unchanged apart from the text?
   - **Leftovers:** is any original text left, or any new text invented?

The report also gives reliability (how often a model returned an image at all), the provider's cost per image, and the time per image.

## The test images

`images/` holds 20 pictures made for this test, so there are no rights or privacy questions: road and shop signs, menus, receipts, forms, medicine labels, posters and phone screenshots, each with light tilt, blur and noise. `images/manifest.json` lists the exact text in every picture. `make_images.py` redraws them (it needs Pillow and NumPy).

## Running it

You need Python 3.10 or newer. The scripts use only the standard library, apart from `make_images.py`.

```sh
export META_MODEL_API_KEY=...        # reading, translating and scoring, and Muse Image
export OPENAI_API_KEY=...            # GPT Image
export GEMINI_API_KEY=...            # Gemini image models on Vertex AI
export GOOGLE_CLOUD_PROJECT=...
export GOOGLE_CLOUD_LOCATION=global

python run_eval.py ocr work
python run_eval.py mt work
python run_eval.py edit work --models muse-image-1.0 --workers 4
python run_eval.py judge work
python run_eval.py report work
```

Everything is saved under `work/` and a stopped run picks up where it left off. Add `--images 3 --langs fr,yo` for a quick, cheap check. Every edit and every score is a paid API call, so start small.

## Read the numbers with care

- **The scorer is a model.** Reading Yoruba or Efik tone marks letter by letter is hard for any vision model, and the scores can be generous. Treat them as a ranking aid, then have a native speaker check a sample of the results.
- **Muse Spark does the scoring by default**, and it is from the same company as Muse Image, so check that it does not favour its own family. Compare against a second scorer before drawing a firm conclusion.
- **The translations come from a translation model**, so a wrong translation is not a wrong picture. The score measures whether the model drew the words it was given.
- **Synthetic pictures are cleaner than real photos.** Add photos you own to `images/` (and their text to `manifest.json`) to test harder cases.
- **Providers can refuse.** A request blocked by a content policy counts against reliability, and it is not charged.
- **Costs are what the providers charge.** Google can also rate-limit new accounts, which shows up as failed runs.
