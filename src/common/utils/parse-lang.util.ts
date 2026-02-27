import { VALID_LANGS, DEFAULT_LANG } from '../constants/lang.constants.js';

export function parseLang(queryLang?: string, headerLang?: string): string {
  if (queryLang && VALID_LANGS.has(queryLang.toLowerCase())) {
    return queryLang.toLowerCase();
  }
  const fromHeader = headerLang?.trim().slice(0, 2).toLowerCase();
  return fromHeader && VALID_LANGS.has(fromHeader) ? fromHeader : DEFAULT_LANG;
}
