/**
 * Shared by `sync-card-audio.ts` (record) and `upload-card-audio.ts` (upload):
 * which text a sign's audio reads, and the file name that text records to.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const CARD_AUDIO_LANGS = ['ka', 'en', 'ru'] as const;
export type CardAudioLang = (typeof CARD_AUDIO_LANGS)[number];

export function isCardAudioLang(value: string): value is CardAudioLang {
  return (CARD_AUDIO_LANGS as readonly string[]).includes(value);
}

/** File name from the text, so identical texts share one recording. */
export function cardAudioFile(text: string): string {
  const hash = crypto.createHash('sha1').update(text).digest('hex');
  return `card_${hash.slice(0, 10)}.webm`;
}

function readTexts(file: string): Record<string, string> {
  return fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>)
    : {};
}

/** slug → the card text shown (`tutor/<lang>.json`). */
export function readCardTexts(
  signsDir: string,
  lang: CardAudioLang,
): Record<string, string> {
  return readTexts(path.join(signsDir, 'tutor', `${lang}.json`));
}

/**
 * slug → the text read aloud: the card text, or a shorter one from
 * `tutor/<lang>-audio.json` (what the sign is about) where that file has it.
 */
export function readCardAudioTexts(
  signsDir: string,
  lang: CardAudioLang,
): Record<string, string> {
  return {
    ...readCardTexts(signsDir, lang),
    ...readTexts(path.join(signsDir, 'tutor', `${lang}-audio.json`)),
  };
}
