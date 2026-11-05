/**
 * No stylesheet comes and goes with each video, and none that left is kept.
 *
 * Adding or removing a <style> makes the browser re-collect the page's rules
 * and restyle what they may touch; on a TV that is a document-wide recalc, the
 * Return YouTube Dislike rules reaching every element with an `idomkey`. Its
 * rules were a <style> added on every watch page and removed on leaving it.
 * They are static, so they now sit in the bundle's one <style> (src/styles.js),
 * gated by the class RYD puts on the stats row, which it takes off again.
 *
 * 1. Each visit opens a video with its description panel, lets RYD put in the
 *    dislike count and goes back Home: the row is laid out by RYD's rules
 *    while it is marked, back to YouTube's once RYD lets go, and after the
 *    first visit no <style> or <link> was added to or removed from the page.
 * 2. With OLED care on, True Black sweeps every stylesheet that enters the
 *    page. Each video with SponsorBlock's "time with skips" rewrites the
 *    label <style>, and a rewritten <style> gets a new sheet; the old sheets
 *    must be let go, not kept in True Black's list of swept sheets.
 * Usage: node bench/stylesheet-churn-test.cjs <bundle> [legacy|modern]
 */
/* eslint-disable no-await-in-loop -- the visits come one after another */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const bundle = fs.readFileSync(process.argv[2] || 'dist/webOSUserScripts/userScript.js', 'utf8');
const mode = process.argv[3] || 'legacy';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const id = (i) => ('r' + String(i).padStart(10, '0')).slice(0, 11);
let gc = global.gc;
if (!gc) { require('v8').setFlagsFromString('--expose-gc'); gc = require('vm').runInNewContext('gc'); }
let fail = 0, checks = 0;
const check = (ok, what) => { checks++; if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); };
async function waitFor(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(10); } return fn(); }

function boot(cfg) {
  const dom = new JSDOM('<!doctype html><html><head></head><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app>' +
    '<div id="ytlr-player__player-container"><video></video></div></ytlr-app></body></html>',
    { runScripts: 'outside-only', url: 'https://www.youtube.com/tv#/', virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
  const win = dom.window, doc = win.document;
  setUserAgent(win, mode === 'modern' ? UA.webos23 : UA.webos3);
  win.launchParams = '{}';
  win.webOS = { deviceInfo: (cb) => cb({ modelName: 'sim' }), platformBack: () => {} };
  win.XMLHttpRequest = class { open() {} send() {} setRequestHeader() {} getResponseHeader() { return null; } addEventListener() {} };
  win.localStorage.setItem('ytng-configuration', JSON.stringify(Object.assign({
    firstRunHintShown: true, enableAutoLogin: false, enableDeArrow: false }, cfg)));
  const nativeRemove = win.Element.prototype.remove;
  if (mode !== 'modern') applyChrome38Downgrade(win);
  win.Element.prototype.remove = nativeRemove; // ChildNode#remove is Chrome 23: webOS 3 has it
  const env = { win, doc, cur: id(0), n: 0 };
  win.fetch = (url) => {
    url = String(url);
    const body = url.indexOf('/votes') !== -1 ? { id: env.cur, likes: 1000, dislikes: 50, viewCount: 99999, rating: 4.8 }
      // A sponsor segment of a different length each video: a different "time with skips".
      : url.indexOf('/skipSegments/') !== -1 ? [{ videoID: env.cur, segments: [{ category: 'sponsor', actionType: 'skip', segment: [30, 60 + 7 * env.n], UUID: 'u' + env.cur, videoDuration: 600 }] }]
      : null;
    if (!body) return Promise.reject(new Error('offline'));
    const text = JSON.stringify(body);
    return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(JSON.parse(text)), text: () => Promise.resolve(text), clone() { return this; } });
  };
  const video = doc.querySelector('video');
  Object.defineProperty(video, 'duration', { configurable: true, get: () => 600 });
  Object.defineProperty(video, 'readyState', { configurable: true, get: () => 4 });
  video.play = () => Promise.resolve();
  video.pause = () => {};
  env.video = video;
  win.eval(bundle);
  return env;
}
function openVideo(env, i) {
  env.cur = id(i); env.n = i;
  env.win.location.hash = '#/watch?v=' + env.cur;
  env.doc.body.className = 'WEB_PAGE_TYPE_WATCH';
  for (const e of ['loadstart', 'loadedmetadata', 'durationchange', 'canplay', 'play', 'playing']) env.video.dispatchEvent(new env.win.Event(e));
}
function goHome(env) {
  env.win.location.hash = '#/';
  env.doc.body.className = 'WEB_PAGE_TYPE_BROWSE';
}

async function rydVisits() {
  const env = boot({ enableReturnYouTubeDislike: true, enableSponsorBlock: true });
  const { win, doc } = env;
  let churn = [];
  new win.MutationObserver((records) => {
    for (const r of records) {
      for (const [list, what] of [[r.addedNodes, 'added'], [r.removedNodes, 'removed']]) {
        for (const n of list) {
          if (n.nodeType === 1 && (n.tagName === 'STYLE' || n.tagName === 'LINK')) churn.push(what + ' <' + n.tagName.toLowerCase() + (n.id ? ' id="' + n.id + '"' : '') + '>');
        }
      }
    }
  }).observe(doc, { childList: true, subtree: true });
  await sleep(600); // RYD's first look at the page is 500 ms after start-up
  const visits = [];
  for (let i = 1; i <= 4; i++) {
    churn = [];
    openVideo(env, i);
    const panel = doc.createElement('ytlr-structured-description-content-renderer');
    panel.innerHTML = '<div class="ytLrVideoDescriptionHeaderRendererFactoidContainer">' +
      '<div class="ytLrVideoDescriptionHeaderRendererFactoid" idomkey="factoid-0" aria-label="1.2M Likes">' +
      '<span class="ytLrVideoDescriptionHeaderRendererValue">1.2M</span><span class="ytLrVideoDescriptionHeaderRendererLabel">Likes</span></div></div>';
    doc.querySelector('ytlr-app').appendChild(panel);
    const row = panel.firstChild;
    const injected = await waitFor(() => doc.getElementById('ryd-dislike-factoid') && row.classList.contains('ryd-ready'), 3000);
    const flexOn = injected && win.getComputedStyle(row).display === 'flex';
    goHome(env);
    await sleep(30);
    const flexOff = win.getComputedStyle(row).display !== 'flex';
    panel.parentNode.removeChild(panel);
    await sleep(10);
    visits.push({ injected, flexOn, flexOff, churn: churn.slice() });
  }
  check(visits.every((v) => v.injected), `dislike count put in on every visit (${visits.filter((v) => v.injected).length} of ${visits.length})`);
  check(visits.every((v) => v.flexOn), 'stats row laid out by RYD\'s rules while RYD has it');
  check(visits.every((v) => v.flexOff), 'stats row back to YouTube\'s layout once RYD lets go');
  const later = visits.slice(1).reduce((a, v) => a.concat(v.churn), []);
  check(later.length === 0, `no <style> or <link> added or removed after the first visit (${later.length}${later.length ? ': ' + [...new Set(later)].join(', ') : ''})`);
  win.close();
}

async function oledVisits() {
  const env = boot({ enableOledCareMode: true, enableSponsorBlock: true, sbShowTimeWithSkips: true, enableReturnYouTubeDislike: false });
  const { win, doc } = env;
  const seen = new WeakSet();
  let left = 0, collected = 0;
  const registry = new FinalizationRegistry(() => { collected++; });
  const current = () => Array.from(doc.styleSheets);
  let before = current();
  const track = () => {
    const now = current();
    for (const s of before) if (now.indexOf(s) === -1) left++;
    for (const s of now) if (!seen.has(s)) { seen.add(s); registry.register(s, 0); }
    before = now;
  };
  track();
  await sleep(300);
  let labelled = 0;
  for (let i = 1; i <= 6; i++) {
    openVideo(env, i);
    const label = await waitFor(() => { const s = doc.getElementById('sb-labels'); return s && s.textContent.indexOf('content:') !== -1 && s.textContent !== env.lastLabel; }, 3000);
    if (label) { labelled++; env.lastLabel = doc.getElementById('sb-labels').textContent; }
    track();
    goHome(env);
    await sleep(20);
    track();
  }
  before = null;
  for (let k = 0; k < 6; k++) { gc(); await sleep(20); }
  check(labelled === 6, `SponsorBlock's label <style> rewritten for every video (${labelled} of 6)`);
  check(left >= 5 && collected >= left - 1, `stylesheets that left the page let go with OLED care on (${collected} of ${left})`);
  win.close();
}

(async () => {
  await rydVisits();
  await oledVisits();
  console.log(fail ? `\n${fail} failed (${mode})` : `\nall ${checks} stylesheet checks passed (${mode})`);
  process.exit(fail ? 1 : 0);
})();
