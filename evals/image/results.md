# Results

Run on 28 October 2026 with the 20 pictures in `images/`, translated into French, Yoruba, Efik and Hausa (80 edits per model). Translations came from Hypa's own translation model; the pictures were read and scored by Muse Spark 1.3. Scores run from 1 to 5.

| Model | Edits that returned an image | Text accuracy | Fidelity | Leftovers | Provider cost per image | Average time |
|---|---|---|---|---|---|---|
| Muse Image 1.0 | 72 of 80 (90%) | 4.26 | 4.74 | 4.90 | $0.010 | 26 s |
| GPT Image 2.5 | 76 of 80 (95%) | 4.43 | 4.80 | 4.99 | $0.022 | 63 s |
| Nano Banana 2.1 | 73 of 80 (91%) | 4.38 | 4.79 | 4.97 | $0.043 | 53 s |
| Gemini 3 Pro Image | 54 of 63 (86%) | 4.37 | 4.43 | 4.44 | $0.140 | 28 s |

Text accuracy by language:

| Model | French | Yoruba | Efik | Hausa |
|---|---|---|---|---|
| Muse Image 1.0 | 4.47 | **4.05** | 4.21 | 4.37 |
| GPT Image 2.5 | 4.80 | 3.67 | 4.56 | 4.65 |
| Nano Banana 2.1 | **4.83** | 3.84 | **4.58** | 4.29 |
| Gemini 3 Pro Image | 4.44 | 3.93 | **4.58** | 5.00 |

## What it shows

- **The four models are close on text accuracy** (4.26 to 4.43). The gaps are small next to the noise of a model scoring a model, so do not read a ranking into them.
- **Yoruba is the hardest language for every model.** Tone marks and dots under letters are where text goes wrong. Muse Image does best on Yoruba, and GPT Image does worst.
- **Muse Image costs the least**, between half and one fourteenth of the others' price, and it kept the picture intact (fidelity 4.74). It is the weakest on French, and it refused 8 edits for content-policy reasons, which count against its reliability.
- **Gemini 3 Pro Image costs 14 times as much as Muse Image** and was the worst at leaving the rest of the picture alone (fidelity 4.43). Its 5.00 for Hausa rests on a few edits.
- Times are the average of one run and vary a lot with provider load, so compare them loosely.

## Limits of this run

- **Gemini 3 Pro Image is incomplete.** Google's rate limit stopped most of its requests, and the run was cut off at 63 of 80 edits, so its numbers rest on fewer edits than the others.
- **A model scored the work.** Muse Spark scored Muse Image's own output, so it may be generous to it. A second scorer from another company would settle that.
- **No native speaker has checked the results.** A second, independent reading is below, but tone marks and Efik spelling still deserve a Yoruba, Hausa and Efik speaker.
- **The pictures are synthetic and clean.** Real photos with glare, angles and handwriting will score lower.
- Only the translations sent to the image model could be wrong without the picture being wrong. The score measures whether the model drew the words it was given.

## Second check: reading every picture letter by letter

To avoid trusting one scorer, a model from a different company (OpenAI's GPT-4o) read the text off every result picture. For each word the image model was told to write, we checked whether it appears exactly, tone marks included. "Right letters, wrong marks" means the word is there but a tone mark or a dot under a letter is missing or wrong.

| Model | Words checked | Exactly right | Right letters, wrong marks | Wrong or missing |
|---|---|---|---|---|
| Muse Image 1.0 | 404 | 75% | 14% | 12% |
| GPT Image 2.5 | 476 | 76% | 14% | 11% |
| Nano Banana 2.1 | 445 | 73% | 15% | 13% |
| Gemini 3 Pro Image | 335 | 71% | 16% | 13% |

Exactly right, by language:

| Model | French | Yoruba | Efik | Hausa |
|---|---|---|---|---|
| Muse Image 1.0 | **93%** | **56%** | 78% | 76% |
| GPT Image 2.5 | 91% | 52% | 74% | **83%** |
| Nano Banana 2.1 | 89% | 48% | **79%** | 75% |
| Gemini 3 Pro Image | 85% | 47% | 78% | 100% (9 words) |

- **The four models are within five points of each other**, as in the first scoring. Muse Image is as accurate as the others at a half to one fourteenth of the price.
- **Yoruba is where every model fails.** Only about half the words are exactly right, and a third to two fifths of them have the right letters with tone marks or dots missing or wrong. This is the weakness to fix, for example by checking the result and retrying.
- **French is the easiest** (85% to 93%).
- The reading model can misread a mark too, so these figures are a lower bound on how often the picture is right.

## The translations are the weak link

A model (not a native speaker) read a sample of the translations. It is confident about French, fairly confident about Yoruba and Hausa, and not confident about Efik. Short labels with no context were often translated badly by the translation model that fed the image models:

- "NO ENTRY" came out as "Non entré" in French, and in Yoruba as a phrase that does not mean "no entry".
- "Take 2 tablets every 8 hours" became "par heure" (every hour) in French.
- "Keep out of reach of children" became "Éloigner des enfants du bord de la mer" (away from the seaside).
- Numbers such as "800" were turned into words, sometimes wrongly.
- Between 2% and 9% of translated strings contained junk, such as `ForCanBeConvertedToF`, `PostalCodesNL`, or letters from another alphabet.

The image models drew these words faithfully, so the pictures can look right and still say the wrong thing. For a product, translate the whole text in one request so the model has context, keep numbers and prices unchanged, reject output with junk in it, and have a person check anything where a mistake matters, such as a medicine label.
