/**
 * Start-up screen: YouTube's #loader grown into the app's (src/start-screen.js).
 *
 * YouTube's page paints #loader (grey, its logo 60 % wide, centred) before the
 * userscript runs. The script puts the logo on a layer of its own inside
 * #loader, at the same place, and animates it with NEXT-GEN under it; the
 * layer goes when YouTube removes #loader. A loader drawn any other way, or
 * none, is left alone.
 * Usage: node bench/start-screen-test.cjs dist/webOSUserScripts/userScript.js [legacy|modern]
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const bundlePath = process.argv[2] || path.resolve(__dirname, '../dist/webOSUserScripts/userScript.js');
const mode = process.argv[3] || 'legacy';
const bundle = fs.readFileSync(bundlePath, 'utf8');

// YouTube's rule as its /tv page has it (the logo shortened to a stub PNG).
const LOADER_RULE = '#loader {height: 100%; left: 0; position: absolute; top: 0; width: 100%; z-index: 0; ' +
  'background-position: center center; background-repeat: no-repeat; background-color: #282828;' +
  'background-size: 60%;background-image: url(data:image/png;base64,iVBORw0KGgo=);}';
const LOADER = '<div id="loader" class="splash-screen-loader"></div>';
const BODY_REST = '<div id="app-background"></div><div id="container"></div><style id="hide-app-container">#container {display: none;}</style>';

function boot({ rule = LOADER_RULE, loader = true, oled = false } = {}) {
  const warnings = [];
  const vc = new VirtualConsole();
  vc.on('warn', (...a) => warnings.push(a.join(' ')));
  const dom = new JSDOM('<!doctype html><html><head><style id="yt">' + rule + '</style></head><body>' +
    (loader ? LOADER : '') + BODY_REST + '</body></html>',
    { runScripts: 'outside-only', url: 'https://www.youtube.com/tv#/', virtualConsole: vc, pretendToBeVisual: true });
  const win = dom.window;
  setUserAgent(win, mode === 'modern' ? UA.webos23 : UA.webos3);
  win.launchParams = '{}';
  win.webOS = { deviceInfo: (cb) => cb({ modelName: 'sim' }), platformBack: () => {} };
  win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };
  win.localStorage.setItem('ytng-configuration', JSON.stringify({
    enableOledCareMode: oled, firstRunHintShown: true, enableSponsorBlock: false, enableReturnYouTubeDislike: false, enableDeArrow: false
  }));
  if (mode !== 'modern') applyChrome38Downgrade(win);
  win.fetch = () => Promise.reject(new Error('offline'));
  let threw = null;
  try { win.eval(bundle); } catch (e) { threw = e; }
  return { win, doc: win.document, warnings, threw };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const layer = (doc) => [...doc.querySelectorAll('.ytng-start-logo, .ytng-start-name')];
const ourCss = (doc) => [...doc.querySelectorAll('style')].map((s) => s.textContent).filter((c) => c.indexOf('ytng-start') !== -1).join('');
// The declarations of the rule with exactly this selector (minified CSS; it may
// come first, or after a rule or an @import).
function rule(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\>]/g, '\\$&');
  const m = new RegExp('(?:^|[};])' + esc + '\\{([^}]*)\\}').exec(css);
  return m ? m[1] : '';
}
function keyframes(css, name) {
  const out = [];
  for (const at of ['@keyframes ', '@-webkit-keyframes ']) {
    const i = css.indexOf(at + name + '{');
    if (i === -1) { out.push(null); continue; }
    let depth = 0, j = css.indexOf('{', i);
    const start = j;
    for (; j < css.length; j++) { if (css[j] === '{') depth++; else if (css[j] === '}' && --depth === 0) break; }
    out.push(css.slice(start + 1, j));
  }
  return out;
}
const props = (block) => (block.match(/[{;]\s*([-a-z]+)\s*:/g) || []).map((m) => m.replace(/[{;:\s]/g, ''));

let pass = 0, fail = 0;
const t = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  ' + JSON.stringify(x))); };

(async () => {
  // A: YouTube's loader as its page draws it.
  const a = boot();
  await sleep(100);
  const loader = a.doc.getElementById('loader');
  t('bundle loads', !a.threw, a.threw && a.threw.message);
  t("YouTube's loader is grown", loader.classList.contains('ytng-start-grown'), loader.className);
  t('the logo layer, then the name, inside #loader', [...loader.children].map((e) => e.className).join() === 'ytng-start-logo,ytng-start-name',
    [...loader.children].map((e) => e.className));
  t('nothing of it outside #loader', layer(a.doc).every((e) => e.parentNode === loader), layer(a.doc).length);
  const css = ourCss(a.doc);
  t("#loader stops drawing its logo (the layer draws it)", rule(css, '#loader.ytng-start-grown') === 'background-size:0 0', rule(css, '#loader.ytng-start-grown'));
  const logo = rule(css, '.ytng-start-grown>.ytng-start-logo');
  t("the layer has YouTube's logo at YouTube's place: 60 % wide, centred, full height",
    ['background-image:inherit', 'left:20%', 'width:60%', 'top:0', 'height:100%', 'background-size:contain'].every((d) => logo.indexOf(d) !== -1)
      && /background-position:(center|50%)( (center|50%))?[;}]?/.test(logo + ';'), logo);
  const name = rule(css, '.ytng-start-grown>.ytng-start-name');
  t('the name is the PNG from design/icons/generate.py', /background-image:url\(data:image\/png;base64,/.test(name) && /opacity:0/.test(name), name.slice(0, 120));
  const frames = ['ytng-start-logo', 'ytng-start-name'].map((n) => keyframes(css, n));
  t('both animations, also as -webkit- (webOS 3)', frames.every((f) => f[0] && f[1]), frames.map((f) => f.map(Boolean)));
  const animated = [...new Set(frames.flat().filter(Boolean).flatMap(props))];
  t('they move transform and opacity only (compositor)', animated.length > 0 && animated.every((p) => ['transform', '-webkit-transform', 'opacity'].indexOf(p) !== -1), animated);
  t('the logo ends at 3/4 size, moved up; the name ends shown',
    /to\{[^}]*transform:translateY\(-[\d.]+vw\) scale\(\.75\)/.test(frames[0][0]) && /to\{opacity:1/.test(frames[1][0]), frames.map((f) => f[0]));
  loader.parentNode.removeChild(loader);
  t('YouTube removes #loader: none of it is left', layer(a.doc).length === 0, layer(a.doc).length);

  // B: no #loader.
  const b = boot({ loader: false });
  await sleep(100);
  t('no #loader: nothing added, no error', !b.threw && layer(b.doc).length === 0 && !b.warnings.some((w) => /StartScreen/.test(w)), [b.threw && b.threw.message, b.warnings]);

  // C: a loader YouTube draws some other way is left alone.
  const c = boot({ rule: LOADER_RULE.replace('background-size: 60%', 'background-size: contain') });
  await sleep(100);
  const cl = c.doc.getElementById('loader');
  t('a loader drawn another way is left alone', !cl.classList.contains('ytng-start-grown') && cl.children.length === 0, cl.className);

  // D: the script runs before #loader is in; it is grown once the page is.
  const d = boot({ loader: false });
  const late = d.doc.createElement('div');
  late.id = 'loader';
  d.doc.body.insertBefore(late, d.doc.body.firstChild);
  const wasLoading = d.doc.readyState === 'loading';
  await sleep(150);
  t('run before the body: grown at DOMContentLoaded', wasLoading && late.classList.contains('ytng-start-grown') && late.children.length === 2, { wasLoading, cls: late.className });

  // E: OLED mode: the loader is grown and YouTube's grey stays as it is.
  const e = boot({ oled: true });
  await sleep(100);
  const ylRule = [...e.doc.getElementById('yt').sheet.cssRules].find((r) => r.selectorText === '#loader');
  t("OLED mode: grown, YouTube's #loader rule untouched",
    e.doc.getElementById('loader').classList.contains('ytng-start-grown') && /#282828|rgb\(40, 40, 40\)/.test(ylRule.style.getPropertyValue('background-color')),
    ylRule.style.getPropertyValue('background-color'));

  console.log(pass + ' passed, ' + fail + ' failed (' + mode + ')');
  process.exit(fail ? 1 : 0);
})();
