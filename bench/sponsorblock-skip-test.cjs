/**
 * SponsorBlock auto skip and its 'seeked' watchdog.
 *
 * On a webOS 25 TV a skip lands exactly on the segment end, but the seek takes
 * 0.5-2.5 s to complete (the longer ones at 1.25x). The watchdog that covers a
 * swallowed 'seeked' fired after 1.5 s regardless, logging "'seeked' never
 * fired after skip" and resetting the skip state while the seek was still in
 * flight - a false alarm that read like the skip had gone wrong. It has to wait
 * for a seek in flight, and still clear the latch when a finished seek never
 * reports, or when a seek is still stuck after 10 s.
 *
 * The <video> is a stand-in: its clock, seeking flag and seek are driven here.
 * Usage: node bench/sponsorblock-skip-test.cjs dist/webOSUserScripts/userScript.js [legacy|modern]
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const bundlePath = process.argv[2] || path.resolve(__dirname, '../dist/webOSUserScripts/userScript.js');
const mode = process.argv[3] || 'legacy';
const bundle = fs.readFileSync(bundlePath, 'utf8');
const VIDEO_ID = 'gX2AKjiZPoM';
const SEGMENT = [55.31, 109.64];
const WATCHDOG_WARNING = "'seeked' never fired";

function boot() {
  const warnings = [];
  const vc = new VirtualConsole();
  vc.on('warn', (...a) => warnings.push(a.join(' ')));
  const dom = new JSDOM('<!doctype html><html><head></head><body class="WEB_PAGE_TYPE_WATCH"><ytlr-app><video></video></ytlr-app></body></html>',
    { runScripts: 'outside-only', url: 'https://www.youtube.com/tv#/watch?v=' + VIDEO_ID, virtualConsole: vc, pretendToBeVisual: true });
  const win = dom.window;
  // webOS 23, not 25: the webOS 25 cast block hooks fetch and builds a Request, which jsdom lacks.
  setUserAgent(win, mode === 'modern' ? UA.webos23 : UA.webos3);
  win.launchParams = '{}';
  win.webOS = { deviceInfo: (cb) => cb({ modelName: 'sim' }), platformBack: () => {} };
  win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };
  win.localStorage.setItem('ytng-configuration', JSON.stringify({
    enableSponsorBlock: true, sbMode_sponsor: 'auto_skip', firstRunHintShown: true, enableReturnYouTubeDislike: false, enableDeArrow: false
  }));
  if (mode !== 'modern') applyChrome38Downgrade(win);
  // After the downgrade, which deletes window.fetch (Chrome 38 has none).
  win.fetch = (url) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(String(url).indexOf('/skipSegments/') !== -1
      ? [{ videoID: VIDEO_ID, segments: [{ category: 'sponsor', actionType: 'skip', segment: SEGMENT.slice(), UUID: 'u1', videoDuration: 600 }] }]
      : [])
  });

  // The video: a clock the test sets, and a seek that stays in flight until
  // the test finishes it.
  const video = win.document.querySelector('video');
  const state = { t: 0, seeking: false, seeks: [] };
  const def = (prop, get, set) => Object.defineProperty(video, prop, { configurable: true, get, set });
  def('currentTime', () => state.t, (v) => { state.seeks.push(v); state.t = v; state.seeking = true; });
  def('seeking', () => state.seeking);
  def('duration', () => 600);
  def('paused', () => false);
  def('readyState', () => 4);
  video.play = () => Promise.resolve();
  video.pause = () => {};

  let threw = null;
  try { win.eval(bundle); } catch (e) { threw = e; }
  return { win, video, state, warnings, threw };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(20); } return fn(); }

// Plays into the segment and returns once the skip's seek has started.
async function skip(env) {
  const ready = await waitFor(() => env.win.sponsorblock && env.win.sponsorblock.skipSegments && env.win.sponsorblock.skipSegments.length === 1, 4000);
  if (!ready) return false;
  env.state.t = 56;
  env.video.dispatchEvent(new env.win.Event('timeupdate'));
  return env.state.seeks.length === 1;
}
function finishSeek(env, withEvent) {
  env.state.seeking = false;
  if (withEvent) env.video.dispatchEvent(new env.win.Event('seeked'));
}

let pass = 0, fail = 0;
const t = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  ' + JSON.stringify(x))); };

(async () => {
  // C runs alongside A and B: a seek that never completes.
  const c = boot();
  const skippedC = await skip(c);
  const cStarted = Date.now();

  // A: the seek takes 2.5 s, as on the TV at 1.25x.
  const a = boot();
  t('bundle loads', !a.threw, a.threw && a.threw.message);
  const skippedA = await skip(a);
  t('the skip seeks to the segment end', skippedA && a.state.seeks[0] === SEGMENT[1], a.state.seeks);
  await sleep(2500);
  t('no watchdog alarm while the seek is in flight (2.5 s)', !a.warnings.some((w) => w.indexOf(WATCHDOG_WARNING) !== -1), a.warnings);
  t('the skip state holds until the seek completes', a.win.sponsorblock && a.win.sponsorblock.isSkipping === true, a.win.sponsorblock && a.win.sponsorblock.isSkipping);
  finishSeek(a, true);
  await sleep(50);
  t("'seeked' ends the skip", a.win.sponsorblock && a.win.sponsorblock.isSkipping === false);

  // B: the seek completes but 'seeked' never comes: the watchdog still clears the latch.
  const b = boot();
  const skippedB = await skip(b);
  await sleep(300);
  finishSeek(b, false);
  await sleep(2000);
  t('a seek that never reports still clears the skip state', skippedB && b.win.sponsorblock && b.win.sponsorblock.isSkipping === false, b.win.sponsorblock && b.win.sponsorblock.isSkipping);
  t('and logs the watchdog warning', b.warnings.some((w) => w.indexOf(WATCHDOG_WARNING) !== -1), b.warnings);

  // C: still seeking at 9 s, the watchdog waits; past 10 s it gives up.
  await sleep(Math.max(0, cStarted + 9000 - Date.now()));
  t('a seek still in flight at 9 s keeps the skip state', skippedC && c.win.sponsorblock && c.win.sponsorblock.isSkipping === true, c.warnings);
  await sleep(Math.max(0, cStarted + 11500 - Date.now()));
  t('a seek stuck past 10 s: the watchdog clears the skip state and warns',
    c.win.sponsorblock && c.win.sponsorblock.isSkipping === false && c.warnings.some((w) => w.indexOf(WATCHDOG_WARNING) !== -1),
    { isSkipping: c.win.sponsorblock && c.win.sponsorblock.isSkipping, warnings: c.warnings });

  console.log(pass + ' passed, ' + fail + ' failed (' + mode + ')');
  process.exit(fail ? 1 : 0);
})();
