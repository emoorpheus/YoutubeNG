/**
 * Translation layer for the NG interface: the settings panel, the first-launch
 * hint, notifications and the SponsorBlock UI. YouTube's own interface is not
 * touched (it follows the TV language on its own).
 *
 * The English text in the code is the source. t(text) returns it unchanged in
 * English, or the text from the active language file. t() is only called where
 * text is shown, never on config keys or values: a missing or wrong entry can
 * change a label but never behaviour.
 *
 * A language file (ru.js, ...) is plain data, laid out like template.js; how
 * to add one is in TRANSLATING.md:
 *   strings    - exact English text -> translation
 *   patterns   - messages built at runtime, with {placeholders}:
 *                {n} a number, {text} copied as is, {tr} translated,
 *                {category} a SponsorBlock category, {Category} the same
 *                capitalised, {categories} a list of categories.
 *                When several match, the one with the most fixed text wins.
 *   categories - SponsorBlock category names, as used inside patterns
 *   and        - the word before the last item of a list: "a, b and c"
 *
 * The language is the 'uiLanguage' setting: 'auto' (default) follows the
 * language YouTube is shown in, else a language code.
 */
import ru from './ru.js';
import { configRead } from '../config.js';

// Every language file, one entry each. English is built in.
const LANGUAGES = [ru];

// Not Object.hasOwn: webOS 3 (Chrome 38) does not have it.
// eslint-disable-next-line prefer-object-has-own
const has = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);

const byCode = {};
LANGUAGES.forEach((lang) => { byCode[lang.code] = lang; });

/** Values of the 'uiLanguage' setting, each language named in itself. */
export const uiLanguages = { auto: 'Auto', en: 'English' };
LANGUAGES.forEach((lang) => { uiLanguages[lang.code] = lang.name; });

// 'pt-BR' -> 'pt-br' if there is such a file, else 'pt', else English.
function codeOf(tag) {
  const full = String(tag || '').toLowerCase().replace('_', '-');
  if (has(byCode, full)) return full;
  const primary = full.split('-')[0];
  return has(byCode, primary) ? primary : 'en';
}

function prefsHl() {
  const pref = (document.cookie || '').split('; ').find((x) => x.startsWith('PREF='));
  return pref ? new URLSearchParams(pref.slice(5)).get('hl') : null;
}

let detected = null;

// YouTube's own UI language, read once it is known; until then the TV's.
function detectLanguage() {
  if (detected) return detected;
  let hl;
  try {
    hl = (window.ytcfg && window.ytcfg.get && window.ytcfg.get('HL'))
      || (window.yt && window.yt.config_ && window.yt.config_.HL)
      || prefsHl();
  } catch { /* no YouTube config yet */ }
  if (hl) return (detected = codeOf(hl));
  return codeOf(document.documentElement.lang || navigator.language);
}

/** The language code the UI is shown in right now ('en', 'ru', ...). */
export function uiLanguage() {
  const v = configRead('uiLanguage');
  return v === 'en' || has(byCode, v) ? v : detectLanguage();
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NUMBER = '([+-]?\\d+(?:\\.\\d+)?)';

// The language's patterns as regular expressions, most fixed text first.
const compiled = {};
function patternsOf(lang) {
  if (compiled[lang.code]) return compiled[lang.code];
  const list = [];
  const patterns = lang.patterns || {};
  Object.keys(patterns).forEach((key, index) => {
    const names = [];
    let fixed = 0;
    const source = key.split(/(\{\w+\})/).map((part, i) => {
      if (i % 2) {
        const name = part.slice(1, -1);
        names.push(name.toLowerCase());
        return name === 'n' ? NUMBER : '(.+)';
      }
      fixed += part.length;
      return escapeRe(part);
    }).join('');
    list.push({ re: new RegExp('^' + source + '$'), names, out: patterns[key], fixed, index });
  });
  list.sort((a, b) => b.fixed - a.fixed || a.index - b.index);
  return (compiled[lang.code] = list);
}

function category(lang, name) {
  const key = String(name).toLowerCase();
  return has(lang.categories, key) ? lang.categories[key] : t(name);
}

// "a", "a and b", "a, b, and c" -> the same list in the language.
function categoryList(lang, list) {
  const parts = String(list).split(/, and | and |, /).map((x) => category(lang, x));
  if (parts.length < 2) return parts[0];
  return parts.slice(0, -1).join(', ') + ' ' + (lang.and || 'and') + ' ' + parts[parts.length - 1];
}

function fill(lang, pattern, m) {
  return pattern.out.replace(/\{(\w+)\}/g, (all, name) => {
    const i = pattern.names.indexOf(name.toLowerCase());
    if (i === -1) return all;
    const value = m[i + 1];
    if (name === 'tr') return t(value);
    if (name === 'category') return category(lang, value);
    if (name === 'Category') return cap(category(lang, value));
    if (name === 'categories') return categoryList(lang, value);
    return value;
  });
}

export function t(text) {
  if (typeof text !== 'string' || text === '') return text;
  const lang = byCode[uiLanguage()];
  if (!lang) return text;
  if (has(lang.strings, text)) return lang.strings[text];
  const patterns = patternsOf(lang);
  for (let i = 0; i < patterns.length; i++) {
    const m = patterns[i].re.exec(text);
    if (m) {
      try { return fill(lang, patterns[i], m); } catch { return text; }
    }
  }
  return text;
}
