export function blueLetterBibleLexiconUrl(
  strongsNumber: string,
): string | null {
  const value = strongsNumber.trim().toLowerCase();
  if (!/^[gh]\d{1,5}$/.test(value)) return null;
  return `https://www.blueletterbible.org/lexicon/${encodeURIComponent(value)}/kjv/tr/0-1/`;
}

/**
 * A safe YouVersion search link when the app cannot prove a canonical
 * YouVersion passage slug. It preserves the reference and avoids inventing a
 * passage URL. The UI labels it "Find in YouVersion", not "verified link".
 */
export function youVersionSearchUrl(reference: string): string {
  return `https://www.bible.com/search/bible?q=${encodeURIComponent(reference)}`;
}
