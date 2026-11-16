import * as fs from 'fs';

/**
 * Optional id filter for the audio sync scripts:
 *   --ids=3,8,12          or   --ids-file=path/to/ids.txt (any separator)
 * Returns null when neither is given (= all candidates).
 */
export function parseIdsArg(argv = process.argv.slice(2)): number[] | null {
  let raw: string | null = null;
  for (const a of argv) {
    if (a.startsWith('--ids=')) raw = a.slice('--ids='.length);
    if (a.startsWith('--ids-file=')) {
      raw = fs.readFileSync(a.slice('--ids-file='.length), 'utf8');
    }
  }
  if (raw === null) return null;
  const ids = [
    ...new Set(
      raw
        .split(/[^0-9]+/)
        .filter(Boolean)
        .map(Number),
    ),
  ];
  if (!ids.length) throw new Error('--ids / --ids-file contains no ids');
  return ids;
}

const GREETINGS: Record<'en' | 'ru', RegExp> = {
  en: /^\s*(?:hello|hi|hey)(?:\s+there)?\s*[!.,:;]*\s*/i,
  ru: /^\s*(?:привет|здравствуй(?:те)?|добрый\s+день)\s*[!.,:;]*\s*/i,
};

/** Spoken text never opens with a greeting; the on-screen ai_tutor text is unchanged. */
export function stripTutorGreeting(text: string, lang: string): string {
  const re = GREETINGS[lang as 'en' | 'ru'];
  const out = re ? text.replace(re, '') : text;
  return out.charAt(0).toUpperCase() + out.slice(1);
}
