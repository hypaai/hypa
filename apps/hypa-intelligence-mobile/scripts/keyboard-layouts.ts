export const alternateCaseForms: Record<string, readonly [string, string]> = {
  b: ['B', 'B'],
  d: ['D', 'D'],
  k: ['K', 'K'],
  y: ['Y', 'Y'],
  ƴ: ['Ƴ', 'Ƴ'],
  'ʼ': ['ʼ', 'ʼ'],
  'ʼy': ['ʼY', 'ʼY'],
  ƙw: ['Ƙw', 'ƘW'],
  ƙy: ['Ƙy', 'ƘY'],
  gy: ['Gy', 'GY'],
  ky: ['Ky', 'KY'],
  e: ['E', 'E'],
  o: ['O', 'O'],
  s: ['S', 'S'],
  ẹ́: ['Ẹ́', 'Ẹ́'],
  ẹ̀: ['Ẹ̀', 'Ẹ̀'],
  ẹ̄: ['Ẹ̄', 'Ẹ̄'],
  ọ́: ['Ọ́', 'Ọ́'],
  ọ̀: ['Ọ̀', 'Ọ̀'],
  ọ̄: ['Ọ̄', 'Ọ̄'],
  é: ['É', 'É'],
  è: ['È', 'È'],
  ē: ['Ē', 'Ē'],
  ó: ['Ó', 'Ó'],
  ò: ['Ò', 'Ò'],
  ō: ['Ō', 'Ō'],
  à: ['À', 'À'],
  á: ['Á', 'Á'],
  ā: ['Ā', 'Ā'],
  ì: ['Ì', 'Ì'],
  í: ['Í', 'Í'],
  ī: ['Ī', 'Ī'],
  ù: ['Ù', 'Ù'],
  ú: ['Ú', 'Ú'],
  ū: ['Ū', 'Ū'],
  ń: ['Ń', 'Ń'],
  ǹ: ['Ǹ', 'Ǹ'],
  n̄: ['N̄', 'N̄'],
  ḿ: ['Ḿ', 'Ḿ'],
  m̀: ['M̀', 'M̀'],
  m̄: ['M̄', 'M̄'],
  i: ['I', 'I'],
  u: ['U', 'U'],
  ị́: ['Ị́', 'Ị́'],
  ị̀: ['Ị̀', 'Ị̀'],
  ị̄: ['Ị̄', 'Ị̄'],
  ụ́: ['Ụ́', 'Ụ́'],
  ụ̀: ['Ụ̀', 'Ụ̀'],
  ụ̄: ['Ụ̄', 'Ụ̄'],
  ṅ: ['Ṅ', 'Ṅ'],
  ị: ['Ị', 'Ị'],
  ọ: ['Ọ', 'Ọ'],
  ụ: ['Ụ', 'Ụ'],
  ñ: ['Ñ', 'Ñ'],
  ɓ: ['Ɓ', 'Ɓ'],
  ɗ: ['Ɗ', 'Ɗ'],
  ƙ: ['Ƙ', 'Ƙ'],
  gb: ['Gb', 'GB'],
  nw: ['Nw', 'NW'],
  ny: ['Ny', 'NY'],
  ch: ['Ch', 'CH'],
  gh: ['Gh', 'GH'],
  gw: ['Gw', 'GW'],
  kp: ['Kp', 'KP'],
  kw: ['Kw', 'KW'],
  sh: ['Sh', 'SH'],
  ts: ['Ts', 'TS'],
};

const qwertyRows = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];
const yorubaRows = [
  ['q', 'w', 'ẹ', 'r', 't', 'y', 'u', 'i', 'ọ', 'p'],
  ['a', 'ṣ', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];
const yorubaAlternates = {
  ẹ: ['e', 'ẹ́', 'ẹ̀', 'ẹ̄', 'é', 'è', 'ē'],
  ọ: ['o', 'ọ́', 'ọ̀', 'ọ̄', 'ó', 'ò', 'ō'],
  ṣ: ['s'],
  a: ['à', 'á', 'ā'],
  i: ['ì', 'í', 'ī'],
  u: ['ù', 'ú', 'ū'],
  n: ['ń', 'ǹ', 'n̄'],
  m: ['ḿ', 'm̀', 'm̄'],
  g: ['gb'],
};

export const keyboardAlphabetRowsByCode: Record<string, string[][]> = {
  en: qwertyRows,
  yo: yorubaRows,
  igl: yorubaRows,
  ig: [
    ['q', 'w', 'ẹ', 'r', 't', 'y', 'ụ', 'ị', 'ọ', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
  ],
  ha: [
    ['q', 'w', 'e', 'r', 't', 'ƴ', 'u', 'i', 'o', 'p'],
    ['a', 's', 'ɗ', 'f', 'g', 'h', 'j', 'ƙ', 'l'],
    ['z', 'x', 'c', 'v', 'ɓ', 'n', 'm'],
  ],
};
export const keyboardAlternatePopupsByCode: Record<string, Record<string, string[]>> = {
  yo: yorubaAlternates,
  igl: yorubaAlternates,
  ig: {
    ị: ['i', 'ị́', 'ị̀', 'ị̄', 'í', 'ì', 'ī'],
    ọ: ['o', 'ọ́', 'ọ̀', 'ọ̄', 'ó', 'ò', 'ō'],
    ụ: ['u', 'ụ́', 'ụ̀', 'ụ̄', 'ú', 'ù', 'ū'],
    a: ['á', 'à', 'ā'],
    ẹ: ['e', 'ẹ́', 'ẹ̀', 'ẹ̄', 'é', 'è', 'ē'],
    n: ['ṅ', 'ñ', 'nw', 'ny', 'ń', 'ǹ', 'n̄'],
    m: ['ḿ', 'm̀', 'm̄'],
    c: ['ch'],
    g: ['gb', 'gh', 'gw'],
    k: ['kp', 'kw'],
    s: ['sh'],
  },
  ha: {
    ɓ: ['b'],
    ɗ: ['d'],
    ƙ: ['k', 'ƙw', 'ƙy', 'kw', 'ky'],
    ƴ: ['y', 'ʼy', 'ʼ'],
    s: ['sh'],
    t: ['ts'],
    g: ['gw', 'gy'],
  },
};

for (const popups of Object.values(keyboardAlternatePopupsByCode)) {
  for (const variants of Object.values(popups)) {
    for (const variant of variants) {
      if (!alternateCaseForms[variant]) throw new Error(`Missing explicit case forms: ${variant}`);
      for (const form of [variant, ...alternateCaseForms[variant]]) {
        if (form !== form.normalize('NFC')) throw new Error(`Non-NFC alternate: ${form}`);
      }
    }
  }
}
