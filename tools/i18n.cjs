#!/usr/bin/env node
/**
 * Translation files of the NG interface (src/i18n). See TRANSLATING.md.
 *
 *   node tools/i18n.cjs check              template.js matches the source, every
 *                                          language file is complete and keeps
 *                                          the placeholders (npm run i18n:check)
 *   node tools/i18n.cjs template           rewrite template.js from the source
 *                                          (npm run i18n:template)
 *   node tools/i18n.cjs new <code> <name>  start src/i18n/<code>.js from the
 *                                          template and register it
 *   node tools/i18n.cjs sync <code>        bring a language file in line with
 *                                          the template: missing entries are
 *                                          added in English, marked // TODO
 *
 * The scan finds the text the code shows: t('...'), showNotification('...'),
 * { text: '...' }, { desc: '...' }, createSection('...'), the tab names in
 * ui.js and the value names in config.js. Text the code builds at runtime is
 * covered by `patterns` in template.js; strings the scan cannot see are kept
 * in the last group of template.js.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const SELF = path.resolve(process.argv[1]);
const ROOT = path.resolve(path.dirname(SELF), '..');
const SRC = path.join(ROOT, 'src');
const DIR = path.join(SRC, 'i18n');
const TEMPLATE = path.join(DIR, 'template.js');
const INDEX = path.join(DIR, 'index.js');
const RUNTIME = 'Built at runtime (not found by the scan)';
// Names and technical terms shown as they are in every language.
const SKIP = new Set(['YouTube Next-Gen', 'SponsorBlock', 'R', '<', '>', 'AV1', 'VP9',
  'AVC (H.264)', 'HEVC (H.265)', 'Premium']);
// Dev-only builds (--env perf) are not translated.
const SKIP_FILES = new Set(['perf_mon.js']);

const KINDS = ['strings', 'patterns', 'categories'];
const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).map((x) => x.toLowerCase()).sort();
const shapeOf = (s) => s.replace(/\{\w+\}/g, '{}');

// --- Source scan -------------------------------------------------------------
function scan() {
  const found = new Map(); // text -> file
  const sources = []; // the code of every file, comments dropped
  const shapes = new Map(); // text with {} where the code puts a value -> file
  const unescape = (s) => s.replace(/\\'/g, "'")
    .replace(/\\u([0-9a-fA-F]{4})/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
  const add = (s, file) => {
    s = unescape(s).trim();
    if (!s || SKIP.has(s) || !/[a-z]/i.test(s) || found.has(s)) return;
    found.set(s, file);
  };
  const addShape = (s, file) => { if (/[a-z]/i.test(s) && !shapes.has(s)) shapes.set(s, file); };
  const lit = String.raw`'((?:[^'\\]|\\.)*)'(\s*\+)?`;
  const calls = [String.raw`\bt\(\s*`, String.raw`showNotification\(\s*`, String.raw`\btext:\s*`,
    String.raw`\bdesc:\s*`, String.raw`createSection\(\s*`];
  const files = fs.readdirSync(SRC).filter((f) => /\.(?:js|ts)$/.test(f) && !SKIP_FILES.has(f)).sort();
  for (const file of files) {
    // Comments are not shown: drop whole-line ones (and commented-out code).
    const code = fs.readFileSync(path.join(SRC, file), 'utf8')
      .replace(/^\s*\/\*[\s\S]*?\*\//gm, '').replace(/^\s*\/\/.*$/gm, '');
    sources.push(code);
    for (const call of calls) {
      for (const m of code.matchAll(new RegExp(call + lit, 'g'))) {
        // 'Text: ' + value is a message built at runtime.
        if (m[2]) addShape(unescape(m[1]) + '{}', file);
        else add(m[1], file);
      }
    }
    for (const m of code.matchAll(/(?:showNotification|\bt)\(\s*`([^`]*)`/g)) {
      if (m[1].indexOf('${') === -1) add(m[1], file);
      else addShape(m[1].replace(/\$\{[^}]*\}/g, '{}'), file);
    }
    if (file === 'config.js') {
      for (const block of code.matchAll(/export const (\w+) = \{([\s\S]*?)\r?\n\};/g)) {
        if (block[1] === 'segmentTypes') continue;
        for (const m of block[2].matchAll(/^\s*\w+:\s*'([^']*)'/gm)) add(m[1], file);
      }
    }
    if (file === 'ui.js') {
      const tabs = code.match(/const tabs = \[([^\]]*)\]/);
      if (tabs) for (const m of tabs[1].matchAll(/'([^']*)'/g)) add(m[1], file);
    }
  }
  const all = sources.join('\n');
  // Whether the code has `text` as a quoted string.
  const quoted = (text) => ["'" + text.replace(/'/g, "\\'") + "'", '"' + text + '"', '`' + text + '`']
    .some((q) => all.indexOf(q) !== -1);
  return { found, shapes, quoted };
}

// --- Language files ----------------------------------------------------------
async function load(file) {
  const url = pathToFileURL(file).href + '?t=' + Date.now();
  return (await import(url)).default;
}

function languageFiles() {
  return fs.readdirSync(DIR).filter((f) => /\.js$/.test(f) && f !== 'index.js' && f !== 'template.js').sort();
}

const quote = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";

/**
 * A language file's text: `layout` is the template's (groups of keys), `lang`
 * the translation (missing entries are written in English and marked TODO).
 */
function render(layout, lang, header, todo = new Set()) {
  const out = [header.trimEnd(), '', 'export default {'];
  const field = (key, value, todo) => `  ${key}: ${quote(value)},${todo ? ' // TODO' : ''}`;
  out.push(field('code', lang.code), field('name', lang.name, lang.name === undefined || todo.has('field name')));
  out.push(field('and', lang.and === undefined ? 'and' : lang.and, lang.and === undefined || todo.has('field and')));
  KINDS.forEach((kind, k) => {
    out.push('', `  ${kind}: {`);
    const entries = [];
    layout[kind].forEach((group) => {
      entries.push({ comment: group.title });
      for (const key of group.keys) entries.push({ key });
    });
    const last = entries.map((e) => !!e.key).lastIndexOf(true);
    entries.forEach((e, i) => {
      if (!e.key) {
        out.push(`    // ${e.comment}`);
        return;
      }
      const has = !!lang[kind] && Object.hasOwn(lang[kind], e.key);
      const value = has ? lang[kind][e.key] : e.key;
      const mark = !has || todo.has(kind + ' ' + e.key) ? ' // TODO' : '';
      out.push(`    ${quote(e.key)}: ${quote(value)}${i === last ? '' : ','}${mark}`);
    });
    out.push(k === KINDS.length - 1 ? '  }' : '  },');
  });
  out.push('};', '');
  return out.join('\n');
}

const TEMPLATE_HEADER = `/**
 * English source text of the YouTube Next-Gen interface: the base for every
 * translation (TRANSLATING.md). Keys are the English text in the code; a
 * language file has the same keys with translated values. Keep every
 * {placeholder}; their order may change.
 *
 * \`strings\` is regenerated from the source by \`npm run i18n:template\`.
 * \`patterns\` (messages built at runtime) and \`categories\` (SponsorBlock
 * category names used in them) are kept as they are: add new ones by hand.
 */`;

const languageHeader = (name) => `/**
 * ${name} - the YouTube Next-Gen interface. Keys are the English source
 * (template.js), values the translation. See TRANSLATING.md.
 */`;

// The entries a language file still marks // TODO, as 'kind key'.
function todoOf(file) {
  const todo = new Set();
  let kind = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const section = line.match(/^ {2}(\w+): \{/);
    if (section) kind = section[1];
    const field = line.match(/^ {2}(name|and): .*\/\/ TODO\b/);
    if (field) todo.add('field ' + field[1]);
    const m = line.match(/^\s+'((?:[^'\\]|\\.)*)':.*\/\/ TODO\b/);
    if (m && kind) todo.add(kind + ' ' + m[1].replace(/\\(.)/g, '$1'));
  }
  return todo;
}

function headerOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  const i = text.indexOf('export default');
  return i > 0 ? text.slice(0, i) : null;
}

// The template's layout: scanned strings by file, then the ones the scan
// cannot see; patterns and categories as they are now.
async function buildTemplate() {
  const { found, shapes, quoted } = scan();
  let old = fs.existsSync(TEMPLATE) ? await load(TEMPLATE) : null;
  if (!old) {
    // First run: everything the language files have.
    old = { strings: {}, patterns: {}, categories: {} };
    const langs = await Promise.all(languageFiles().map((f) => load(path.join(DIR, f))));
    for (const lang of langs) {
      for (const kind of KINDS) for (const k of Object.keys(lang[kind] || {})) old[kind][k] = k;
    }
  }
  const patternKeys = Object.keys(old.patterns || {});
  const patternShapes = new Set(patternKeys.map(shapeOf));
  const byFile = new Map();
  for (const [text, file] of found) {
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(text);
  }
  const groups = [...byFile].map(([file, keys]) => ({ title: file, keys }));
  // Kept while the code still has the text, such as a value picked at runtime.
  const runtime = Object.keys(old.strings || {}).filter((k) => !found.has(k) && quoted(k));
  if (runtime.length) groups.push({ title: RUNTIME, keys: runtime });
  const unmatched = [...shapes].filter(([s]) => !patternShapes.has(s));
  const layout = {
    strings: groups,
    patterns: [{ title: 'Messages built at runtime', keys: patternKeys }],
    categories: [{ title: 'SponsorBlock categories (lower case)', keys: Object.keys(old.categories || {}) }]
  };
  const english = { code: 'xx', name: 'Language name, in that language', and: 'and' };
  for (const kind of KINDS) {
    english[kind] = {};
    for (const group of layout[kind]) for (const k of group.keys) english[kind][k] = k;
  }
  return { layout, english, unmatched, text: render(layout, english, TEMPLATE_HEADER) };
}

const idOf = (code) => code.replace(/[^a-z0-9]/g, '_');

function register(code) {
  let index = fs.readFileSync(INDEX, 'utf8');
  const id = idOf(code);
  if (new RegExp(`from './${code}\\.js'`).test(index)) return false;
  const imports = [...index.matchAll(/^import \w+ from '\.\/[\w-]+\.js';$/gm)];
  const lastImport = imports[imports.length - 1];
  const at = lastImport.index + lastImport[0].length;
  index = index.slice(0, at) + `\nimport ${id} from './${code}.js';` + index.slice(at);
  index = index.replace(/const LANGUAGES = \[([^\]]*)\];/, (m, list) => `const LANGUAGES = [${list.trim() ? list.trim() + ', ' : ''}${id}];`);
  fs.writeFileSync(INDEX, index);
  return true;
}

// --- Commands ------------------------------------------------------------------
async function check() {
  const problems = [];
  const notes = [];
  const tpl = await buildTemplate();
  const current = fs.existsSync(TEMPLATE) ? fs.readFileSync(TEMPLATE, 'utf8') : '';
  if (current !== tpl.text) problems.push('template.js is out of date: run `npm run i18n:template`');
  for (const [shape, file] of tpl.unmatched) {
    problems.push(`${file}: "${shape}" is built at runtime but no pattern in template.js covers it`);
  }
  const index = fs.readFileSync(INDEX, 'utf8');
  const files = languageFiles();
  const langs = await Promise.all(files.map((f) => load(path.join(DIR, f))));
  files.forEach((f, i) => {
    const file = path.join(DIR, f);
    const code = f.replace(/\.js$/, '');
    const lang = langs[i];
    const say = (msg) => problems.push(`${f}: ${msg}`);
    if (!lang || lang.code !== code) say(`code must be '${code}' (the file name)`);
    if (code !== code.toLowerCase()) say('the file name must be lower case, such as pt-br.js');
    if (!lang.name) say('name is missing');
    if (!new RegExp(`import (\\w+) from './${code}\\.js'`).test(index)) say('not registered in src/i18n/index.js (node tools/i18n.cjs new adds it)');
    const todo = (fs.readFileSync(file, 'utf8').match(/\/\/ TODO\b/g) || []).length;
    if (todo) say(`${todo} entries marked // TODO`);
    let missing = 0;
    for (const kind of KINDS) {
      const theirs = lang[kind] || {};
      for (const key of Object.keys(tpl.english[kind])) {
        if (!Object.hasOwn(theirs, key)) { missing++; continue; }
        const value = theirs[key];
        if (typeof value !== 'string' || !value.trim()) say(`${kind} '${key}' is empty`);
        else if (placeholders(key).join() !== placeholders(value).join()) {
          say(`${kind} '${key}': placeholders ${placeholders(key).join(' ') || '(none)'} became ${placeholders(value).join(' ') || '(none)'}`);
        }
      }
      for (const key of Object.keys(theirs)) {
        if (!Object.hasOwn(tpl.english[kind], key)) say(`${kind} '${key}' is not in template.js (node tools/i18n.cjs sync ${code} removes it)`);
      }
    }
    if (missing) say(`${missing} entries missing (node tools/i18n.cjs sync ${code} adds them)`);
    const total = KINDS.reduce((n, kind) => n + Object.keys(tpl.english[kind]).length, 0);
    notes.push(`${f}: ${lang.name || '?'}, ${total - missing}/${total} entries`);
  });
  const counts = KINDS.map((kind) => `${Object.keys(tpl.english[kind]).length} ${kind}`).join(', ');
  console.log(`template.js: ${counts}`);
  for (const n of notes) console.log(n);
  if (problems.length) {
    for (const p of problems) console.log('  - ' + p);
    console.log(`i18n check: ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log('i18n check: ok');
}

async function main() {
  const [cmd, code, ...rest] = process.argv.slice(2);
  if (cmd === 'check') return check();
  if (cmd === 'template') {
    const tpl = await buildTemplate();
    fs.writeFileSync(TEMPLATE, tpl.text);
    console.log(`Wrote ${path.relative(ROOT, TEMPLATE)}`);
    for (const [s, f] of tpl.unmatched) console.log(`  ${f}: "${s}" has no pattern: add one to template.js`);
    return;
  }
  if ((cmd === 'new' || cmd === 'sync') && code) {
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(code) || code === 'en') {
      throw new Error(`Language code: a lower-case code such as de, pt-br (not '${code}')`);
    }
    const file = path.join(DIR, code + '.js');
    const tpl = await buildTemplate();
    if (cmd === 'new') {
      if (fs.existsSync(file)) throw new Error(`${path.relative(ROOT, file)} exists: use sync`);
      const name = rest.join(' ') || undefined;
      fs.writeFileSync(file, render(tpl.layout, { code, name }, languageHeader(name || code)));
      console.log(`Wrote ${path.relative(ROOT, file)}: translate the values, remove each // TODO`);
      if (register(code)) console.log('Registered in src/i18n/index.js');
      return;
    }
    if (!fs.existsSync(file)) throw new Error(`No ${path.relative(ROOT, file)}: use new`);
    const lang = await load(file);
    for (const kind of KINDS) {
      for (const key of Object.keys(lang[kind] || {})) {
        if (!Object.hasOwn(tpl.english[kind], key)) console.log(`Removed ${kind} '${key}'`);
      }
    }
    fs.writeFileSync(file, render(tpl.layout, lang, headerOf(file) || languageHeader(lang.name), todoOf(file)));
    console.log(`Wrote ${path.relative(ROOT, file)}`);
    return;
  }
  console.log(fs.readFileSync(SELF, 'utf8').split('\n').slice(2, 15).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
  process.exit(cmd ? 1 : 0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
