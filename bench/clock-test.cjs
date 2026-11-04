/**
 * Display Time in UI (src/watch.js): Off / Time / Date + Time, ported from
 * upstream 0.8.5 b2 (#203). Up to pre-release04 the setting was a checkbox,
 * so a stored true must still mean the time and a stored false no clock.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const ROOT = path.resolve(__dirname, '..');
const bundlePath = process.argv[2] || ROOT + '/dist/webOSUserScripts/userScript.js';

function boot(showWatch, language) {
  const dom = new JSDOM('<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>',
    { runScripts: 'outside-only', url: 'https://www.youtube.com/tv',
      virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
  const win = dom.window;
  setUserAgent(win, UA.webos3);
  if (language) Object.defineProperty(win.navigator, 'language', { get: () => language, configurable: true });
  win.launchParams = '{}';
  win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };
  win.requestAnimationFrame = () => 0;
  win.cancelAnimationFrame = () => {};
  win.fetch = () => Promise.reject(new Error('offline'));
  win.localStorage.setItem('ytng-configuration', win.JSON.stringify({
    enableAdBlock: false, enableSponsorBlock: false, enableReturnYouTubeDislike: false,
    enableLegacyEmojiFix: false, upgradeThumbnails: false, enableAutoLogin: false, showWatch
  }));
  applyChrome38Downgrade(win);
  // A throw at start-up (an Intl RangeError, say) would stop the whole bundle.
  try { win.eval(fs.readFileSync(bundlePath, 'utf8')); } catch (e) { win.bootError = e.name + ': ' + e.message; }
  return win;
}

let pass = 0, fail = 0;
const t = (n, ok, extra) => { if (ok) { pass++; console.log('PASS ' + n); }
  else { fail++; console.log('FAIL ' + n + (extra ? '\n     ' + extra : '')); } };

const clock = (win) => win.document.querySelector('.webOs-watch');
const text = (win) => (clock(win) ? clock(win).textContent : null);
const TIME = /^\d{1,2}:\d{2}(?: [AP]M)?$/;
const DATETIME = /^\d{1,2}\/\d{1,2} \d{1,2}:\d{2}(?: [AP]M)?$/;   // en-US: "11/5 10:49 AM"

{
  const win = boot(true);
  t('stored true (old checkbox) shows the time', TIME.test(text(win) || ''), text(win));
}
{
  const win = boot(false);
  t('stored false (old checkbox) shows no clock', !clock(win));
}
{
  const win = boot('off');
  t("'off' shows no clock", !clock(win));
}
{
  const win = boot('time');
  t("'time' shows the time alone", TIME.test(text(win) || ''), text(win));
}
{
  const win = boot('datetime');
  t("'datetime' shows month/day and the time, no comma", DATETIME.test(text(win) || ''), text(win));
}
{
  const win = boot('time', 'en-US@posix');
  t('a language tag Intl refuses still gets a clock', TIME.test(text(win) || ''), text(win) + ' ' + (win.bootError || ''));
}
{
  const win = boot('time');
  if (clock(win)) clock(win).textContent = 'stale';
  win.document.dispatchEvent(new win.Event('visibilitychange'));
  t('back in the foreground the time is refreshed at once', TIME.test(text(win) || ''), text(win));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
