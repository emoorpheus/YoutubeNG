/**
 * Verifies dist/index.js (the launcher page) still builds the same YouTube URL
 * after the launch.js split, under a simulated Chromium 38. The page leaves
 * only after it has been painted (a frame), or after 200 ms without frames.
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { applyChrome38Downgrade } = require('./chrome38-env.cjs');

const cases = [
  [{}, ['env_forceFullAnimation=1', 'env_enableWebSpeech=1', 'env_enableVoice=1']],
  [{ contentTarget: 'v=dQw4w9WgXcQ' }, ['v=dQw4w9WgXcQ']],
  [{ contentTarget: 'v=v=dQw4w9WgXcQ' }, ['v=dQw4w9WgXcQ']],
  [{ contentTarget: 'https://www.youtube.com/tv?v=abc&t=5' }, ['v=abc', 't=5']],
  [{ contentTarget: { intent: 'PlayContent', intentParam: 'lofi beats' } },
   ['inApp=true', 'vs=9', 'va=play', 'launch=voice', 'vq=lofi+beats']],
  [{ contentTarget: { intent: 'SearchContent', intentParam: 'cats' } },
   ['va=search', 'launch=voice', 'launch=search', 'vq=cats']],
  [{ contentTarget: 'theme=k' }, ['theme=k']]
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Loads dist/index.js; returns the URL it went to: synchronously, by `early` ms and by 300 ms.
async function launch(params, visual, early) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.com/', runScripts: 'outside-only', pretendToBeVisual: visual
  });
  const w = dom.window;
  w.launchParams = JSON.stringify(params);

  // jsdom's window.location is non-configurable, so shadow `window` inside the
  // bundle with a proxy that forwards everything except location.
  w.eval(`
    var __href = null;
    var __fakeLocation = { get href() { return 'https://example.com/'; },
                           set href(v) { __href = v; } };
    var __fakeWindow = new Proxy(window, {
      get: function (t, k) {
        if (k === 'location') return __fakeLocation;
        var v = t[k];
        return typeof v === 'function' ? v.bind(t) : v;
      },
      set: function (t, k, v) { t[k] = v; return true; }
    });
    function __getHref() { return __href; }
  `);

  // Downgrade only after the Proxy shim is built (Proxy itself is Chrome 49).
  applyChrome38Downgrade(w);

  w.eval('(function(window){' + fs.readFileSync(ROOT + '/dist/index.js', 'utf8') + '})(__fakeWindow)');
  const sync = w.eval('__getHref()');
  await sleep(early);
  const byEarly = w.eval('__getHref()');
  await sleep(300 - early);
  return { sync, byEarly, href: w.eval('__getHref()') };
}

(async () => {
let fail = 0;
for (const [params, expects] of cases) {
  let r;
  try { r = await launch(params, false, 150); } catch (e) { console.log('FAIL threw:', e.message); fail++; continue; }
  const href = r.href;

  const missing = expects.filter((e) => !href || href.indexOf(e) === -1);
  const noTheme = params.contentTarget === 'theme=k'
    ? href.indexOf('env_forceFullAnimation') !== -1 : false;
  if (missing.length || noTheme) {
    fail++;
    console.log(`FAIL ${JSON.stringify(params)}\n     href    ${href}\n     missing ${missing.join(', ')}${noTheme ? ' | env_* not stripped for theme=k' : ''}`);
  } else {
    console.log(`PASS ${JSON.stringify(params).slice(0, 58)}`);
  }
}
// The grey page is painted before it leaves: not in the same task; with frames,
// after the first one (well before 200 ms); without frames, after 200 ms.
const timing = [
  ['stays until painted', async () => { const r = await launch({}, true, 150); return r.sync === null && !!r.byEarly; }],
  ['no frames: leaves after 200 ms', async () => { const r = await launch({}, false, 150); return r.sync === null && r.byEarly === null && !!r.href; }]
];
for (const [name, run] of timing) {
  let ok = false;
  try { ok = await run(); } catch (e) { console.log('FAIL threw:', e.message); }
  if (ok) console.log(`PASS ${name}`); else { fail++; console.log(`FAIL ${name}`); }
}
const total = cases.length + timing.length;
console.log(fail ? `\n${fail} failed` : `\nall ${total} launch cases passed`);
process.exit(fail ? 1 : 0);
})();
