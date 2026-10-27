import {
  LANGUAGE_INFO_BY_CODE,
  LANGUAGE_INFO_BY_NAME,
} from "@hypa/config/language-metadata";

const MANSA_ENGLISH_ONLY_CODES = [
  "rn",
  "nr",
  "ss",
  "ti",
  "tw",
  "ee",
  "ln",
  "kg",
  "bm",
  "bem",
];
const canonical = (value: string) => {
  const key = value.trim().toLowerCase();
  return (
    LANGUAGE_INFO_BY_CODE[key]?.name ??
    LANGUAGE_INFO_BY_NAME[key]?.name ??
    key
  ).toLowerCase();
};
const englishOnly = new Set(MANSA_ENGLISH_ONLY_CODES.map(canonical));

export function supportsMtPair(
  provider: string,
  source: string | null,
  target: string,
): boolean {
  if (provider !== "mansa") return true;
  if (!source || /^auto(?:[ -]?detect)?$/i.test(source.trim())) return false;
  const from = canonical(source);
  const to = canonical(target);
  return (
    (!englishOnly.has(from) || to === "english") &&
    (!englishOnly.has(to) || from === "english")
  );
}
