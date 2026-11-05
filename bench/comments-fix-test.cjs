/**
 * The comments-panel fix's start-up scan (src/comments-fix.js).
 *
 * The fix looks through the page's stylesheets for YouTube's rule that
 * collapses a closing panel, every second for up to 30 s until it is found.
 * If YouTube renames its classes it is never found, and every look went
 * through all of YouTube's rules again (about 3,700 on a TV) and wrote the
 * fallback into its <style> again: 30 walks and 30 sheet replacements in the
 * first half minute. A sheet already looked through with no new rules since has
 * nothing new to find; the fallback is written once.
 *
 * 1. The rule comes in a <style> YouTube adds later: the override is built
 *    from it.
 * 2. The rule comes later in a sheet already there (insertRule): found too.
 * 3. No such rule in 4,000: after the first look, the retries read no rule
 *    of a sheet that has not changed, and the fallback is written once.
 * Usage: node bench/comments-fix-test.cjs <bundle> [legacy|modern]
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const bundle = fs.readFileSync(process.argv[2] || 'dist/webOSUserScripts/userScript.js', 'utf8');
const mode = process.argv[3] || 'legacy';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0, checks = 0;
const check = (ok, what) => { checks++; if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); };
async function waitFor(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(20); } return fn(); }
const CLOSE_RULE = 'ytlr-animated-overlay.frHKed .AmQJbe{height:0}';
const OVERRIDE = 'ytlr-animated-overlay.frHKed .AmQJbe {';

function boot() {
  const dom = new JSDOM('<!doctype html><html><head></head><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>',
    { runScripts: 'outside-only', url: 'https://www.youtube.com/tv#/', virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
  const win = dom.window;
  setUserAgent(win, mode === 'modern' ? UA.webos23 : UA.webos3);
  win.launchParams = '{}';
  win.XMLHttpRequest = class { open() {} send() {} setRequestHeader() {} getResponseHeader() { return null; } addEventListener() {} };
  win.localStorage.setItem('ytng-configuration', JSON.stringify({ firstRunHintShown: true, enableAutoLogin: false }));
  const nativeRemove = win.Element.prototype.remove;
  if (mode !== 'modern') applyChrome38Downgrade(win);
  win.Element.prototype.remove = nativeRemove;
  win.eval(bundle);
  return win;
}
// YouTube's stylesheets: `n` rules none of which collapses a closing panel.
function youtubeSheets(win, sheets, n) {
  const els = [];
  for (let s = 0; s < sheets; s++) {
    let css = '';
    for (let i = 0; i < n; i++) css += `.yt${s}x${i} .c${i % 50}{color:#${(i % 4096).toString(16).padStart(3, '0')};height:${i}px}`;
    const el = win.document.createElement('style');
    el.textContent = css;
    win.document.head.appendChild(el);
    els.push(el);
  }
  return els;
}
const fixText = (win) => { const el = win.document.getElementById('ytng-comments-close-fix'); return el ? el.textContent : ''; };

async function lateSheet() {
  const win = boot();
  youtubeSheets(win, 1, 200);
  await sleep(1200);
  const el = win.document.createElement('style');
  el.textContent = '.other{color:red}' + CLOSE_RULE;
  win.document.head.appendChild(el);
  check(await waitFor(() => fixText(win).indexOf(OVERRIDE) !== -1, 2500), 'override built from a rule in a <style> YouTube adds later');
  win.close();
}
async function lateRule() {
  const win = boot();
  const [el] = youtubeSheets(win, 1, 200);
  await sleep(1200);
  el.sheet.insertRule('ytlr-animated-overlay.xmQAdc .AmQJbe{display:none}', el.sheet.cssRules.length);
  check(await waitFor(() => fixText(win).indexOf('ytlr-animated-overlay.xmQAdc .AmQJbe {') !== -1, 2500), 'override built from a rule added later to a sheet already there');
  win.close();
}
async function neverFound() {
  const win = boot();
  const els = youtubeSheets(win, 4, 1000);
  // Count every read of these rules' selectors, and every write of the fix's <style>.
  let reads = 0;
  for (const el of els) {
    const rules = el.sheet.cssRules;
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i], v = r.selectorText;
      Object.defineProperty(r, 'selectorText', { configurable: true, get() { reads++; return v; } });
    }
  }
  let writes = 0;
  const fix = await waitFor(() => win.document.getElementById('ytng-comments-close-fix'), 1500) && win.document.getElementById('ytng-comments-close-fix');
  if (fix) new win.MutationObserver(() => { writes++; }).observe(fix, { childList: true, characterData: true, subtree: true });
  const t0 = Date.now();
  await sleep(3300); // three or four retries
  const looks = Math.round((Date.now() - t0) / 1000);
  check(!!fix && fixText(win).indexOf('display: revert') !== -1, 'fallback in place while the rule is not found');
  check(reads <= 4000, `retries read the rules of unchanged sheets once in all (${reads} reads of 4,000 rules over ${looks} retries)`);
  check(writes === 0, `fallback not written again by the retries (${writes} writes)`);
  win.close();
}

(async () => {
  await Promise.all([lateSheet(), lateRule(), neverFound()]);
  console.log(fail ? `\n${fail} failed (${mode})` : `\nall ${checks} comments-fix checks passed (${mode})`);
  process.exit(fail ? 1 : 0);
})();
