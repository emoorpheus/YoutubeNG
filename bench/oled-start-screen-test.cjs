/**
 * OLED mode and YouTube's start-up screen. Modern build.
 * YouTube's page paints #loader (grey, its logo) before the userscript is in;
 * OLED mode must leave it exactly as YouTube draws it - no second look during
 * launch - while the other surface greys still turn black.
 * Usage: node bench/oled-start-screen-test.cjs dist/webOSUserScripts/userScript.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const bundle = process.argv[2] || path.resolve(__dirname, '../dist/webOSUserScripts/userScript.js');
const dom = new JSDOM(`<!doctype html><html><head>
  <style id="yt">#loader {position: absolute; width: 100%; height: 100%; background-color: #282828; background-size: 60%;}
  .banner {background-color: #282828;} .page {background-color: #0f0f0f;}</style>
  </head><body><div id="loader" class="splash-screen-loader"></div><div class="banner"></div><div id="container"></div></body></html>`,
  { runScripts: 'outside-only', url: 'https://www.youtube.com/tv#/', virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
const win = dom.window;
Object.defineProperty(win.navigator, 'userAgent', { value: 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.211 Safari/537.36 WebAppManager' });
win.launchParams = '{}';
win.webOS = { deviceInfo: (cb) => cb({ modelName: 'sim' }), platformBack: () => {} };
win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };
win.fetch = () => Promise.reject(new Error('offline'));
win.localStorage.setItem('ytng-configuration', JSON.stringify({ enableOledCareMode: true, firstRunHintShown: true, enableSponsorBlock: false, enableReturnYouTubeDislike: false }));
// jsdom's CSSOM rules have no camel-case properties; the sweep reads them the
// way Chrome serialises them (rgb(...)).
const hexToRgb = (v) => { const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v).trim()); if (!m) return v;
  let h = m[1]; if (h.length === 3) h = h.replace(/./g, '$&$&');
  return 'rgb(' + [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ') + ')'; };
const ruleStyle = Object.getPrototypeOf(win.document.getElementById('yt').sheet.cssRules[0].style);
for (const [prop, css] of [['backgroundColor', 'background-color'], ['backgroundImage', 'background-image']])
  if (!(prop in ruleStyle)) Object.defineProperty(ruleStyle, prop, { configurable: true, get() { return hexToRgb(this.getPropertyValue(css)); } });
let threw = null;
try { win.eval(fs.readFileSync(bundle, 'utf8')); } catch (e) { threw = e; }
let pass = 0, fail = 0;
const t = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' ' + JSON.stringify(x))); };
setTimeout(() => {
  const doc = win.document;
  const rules = [...doc.getElementById('yt').sheet.cssRules];
  const bg = (sel) => rules.find((r) => r.selectorText === sel).style.backgroundColor;
  const loader = win.getComputedStyle(doc.getElementById('loader'));
  t('bundle loads', !threw, threw && threw.message);
  t('OLED mode is on', doc.documentElement.classList.contains('oled-theme-active'));
  t('other surface greys turn black', /^(#000|rgb\(0, 0, 0\))$/.test(bg('.banner')) && /^(#000|rgb\(0, 0, 0\))$/.test(bg('.page')), [bg('.banner'), bg('.page')]);
  t("YouTube's #loader rule is left alone", bg('#loader') === 'rgb(40, 40, 40)', bg('#loader'));
  t('#loader looks as YouTube draws it', loader.backgroundColor === 'rgb(40, 40, 40)' && (!loader.backgroundImage || loader.backgroundImage === 'none'), [loader.backgroundColor, loader.backgroundImage]);
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}, 1500);
