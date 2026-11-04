/**
 * Behaviour of thumbnail-quality.js and return-dislike.js: thumbnail URLs are
 * rewritten in the parsed response (safe vs eager, probe, write-back), and the
 * dislike panel must still be detected by focus and navigate the same way.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const ROOT = path.resolve(__dirname, '..');
const bundlePath = process.argv[2] || ROOT + '/dist/webOSUserScripts/userScript.js';

function boot(cfg, html, url) {
  const dom = new JSDOM(html, { runScripts: 'outside-only',
    url: url || 'https://www.youtube.com/tv', virtualConsole: new VirtualConsole(),
    pretendToBeVisual: true });
  const win = dom.window;
  setUserAgent(win, UA.webos3);
  win.launchParams = '{}';
  const probed = [];
  win.XMLHttpRequest = class {
    open(m, u) { this._u = u; } send() { probed.push(this._u); if (this.onerror) this.onerror(); }
    setRequestHeader() {} getResponseHeader() { return null; } addEventListener() {}
  };
  let rafQ = [];
  win.requestAnimationFrame = (cb) => { rafQ.push(cb); return rafQ.length; };
  win.cancelAnimationFrame = () => {};
  win.fetch = () => Promise.reject(new Error('offline'));
  win.Element.prototype.getBoundingClientRect = function () {
    return { top: 0, left: 0, right: 200, bottom: 100, width: 200, height: 100, x: 0, y: 0 };
  };
  win.Element.prototype.scrollIntoView = function () {};
  // jsdom never loads images, so the module's WebP feature-detect would await a
  // promise that never settles and no upgrade would ever run. Resolve it as
  // "no webp", which is the Chromium 38 answer anyway.
  win.Image = class { set src(_v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
  win.localStorage.setItem('ytng-configuration', win.JSON.stringify(Object.assign({
    enableAdBlock: true, enableLegacyEmojiFix: false, enableSponsorBlock: false,
    enableReturnYouTubeDislike: false, upgradeThumbnails: false, enableAutoLogin: false
  }, cfg)));
  applyChrome38Downgrade(win);
  win.eval(fs.readFileSync(bundlePath, 'utf8'));
  return { win, probed, pump: () => { const q = rafQ; rafQ = []; for (const cb of q) cb(0); } };
}

let pass = 0, fail = 0;
const t = (n, ok, extra) => { if (ok) { pass++; console.log('PASS ' + n); }
  else { fail++; console.log('FAIL ' + n + (extra ? '\n     ' + extra : '')); } };
const tick = () => new Promise((r) => setTimeout(r, 0));

setTimeout(async () => {
  // ---- thumbnail-quality: URLs are rewritten inside the JSON.parse hook ----
  // A continuation shaped like the ones the Home rows load while scrolling.
  const tile = (id, names) => ({ tileRenderer: { header: { tileHeaderRenderer: { thumbnail: {
    thumbnails: names.map((n) => ({ url: 'https://i.ytimg.com/vi/' + id + '/' + n + '.jpg', width: 480, height: 360 }))
  } } } } });
  // Padded: the hook skips strings under 500 chars, which no real row is.
  const grid = (items) => JSON.stringify({ continuationContents: { gridContinuation: { items } },
    responseContext: { padding: 'x'.repeat(500) } });
  const urlsOf = (data, i) => data.continuationContents.gridContinuation.items[i]
    .tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails.map((e) => e.url);
  const settle = async (pump) => {
    for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 40)); pump(); }
  };
  const bootThumbs = (mode) => boot({ upgradeThumbnails: true, thumbnailQualityMode: mode },
    '<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>');

  {
    const { win, probed, pump } = bootThumbs('safe');
    await tick(); pump(); await tick();
    const data = win.JSON.parse(grid([
      tile('safeHq00000', ['hqdefault']),
      tile('shipped0000', ['hqdefault', 'maxresdefault']),
      tile('oddName0000', ['hq1'])
    ]));
    await settle(pump);
    t('safe: an unproven tile stays on hqdefault', urlsOf(data, 0)[0].endsWith('/safeHq00000/hqdefault.jpg'),
      urlsOf(data, 0)[0]);
    t('safe: maxresdefault is checked with one probe',
      probed.filter((u) => /safeHq00000\/maxresdefault/.test(u)).length === 1, 'probed: ' + probed.join(' | '));
    t('safe: lower rungs are never probed', !probed.some((u) => /hqdefault|sddefault/.test(u)),
      'probed: ' + probed.join(' | '));
    t('a rung YouTube shipped is used without a probe',
      urlsOf(data, 1)[0].endsWith('/shipped0000/maxresdefault.jpg') && !probed.some((u) => /shipped0000/.test(u)),
      urlsOf(data, 1)[0] + ' probed: ' + probed.join(' | '));
    t('an unknown basename is left exactly as sent', urlsOf(data, 2)[0].endsWith('/oddName0000/hq1.jpg'),
      urlsOf(data, 2)[0]);
  }

  {
    const { win, pump } = bootThumbs('eager');
    await tick(); pump(); await tick();
    const data = win.JSON.parse(grid([tile('eagerMiss00', ['hqdefault'])]));
    t('eager: goes straight to maxresdefault', urlsOf(data, 0)[0].endsWith('/eagerMiss00/maxresdefault.jpg'),
      urlsOf(data, 0)[0]);
    await settle(pump);   // the probe fails (offline XHR) - the gamble missed
    t('eager: a failed probe writes the tile back to hqdefault',
      urlsOf(data, 0)[0].endsWith('/eagerMiss00/hqdefault.jpg'), urlsOf(data, 0)[0]);
  }

  // ---- return-dislike: panel detection + navigation ----
  {
    const { win, pump } = boot({ enableReturnYouTubeDislike: true },
      '<!doctype html><html><body class="WEB_PAGE_TYPE_WATCH"><ytlr-app>' +
      '<div id="ytlr-player__player-container"><video></video></div></ytlr-app></body></html>',
      'https://www.youtube.com/tv#/watch?v=dQw4w9WgXcQ');
    await new Promise((r) => setTimeout(r, 900));
    const d = win.document;
    const ryd = win.returnYouTubeDislike;
    t('RYD instance created', !!ryd);

    // Build a description panel a few levels below <ytlr-app>, as YouTube does.
    const app = d.querySelector('ytlr-app');
    const wrap1 = d.createElement('div'); const wrap2 = d.createElement('div');
    const panel = d.createElement('ytlr-structured-description-content-renderer');
    const items = [];
    for (let i = 0; i < 4; i++) {
      const it = d.createElement('div');
      it.setAttribute('role', 'menuitem');
      it.setAttribute('tabindex', '0');
      const inner = d.createElement('span');       // focus lands on a child
      inner.setAttribute('tabindex', '0');
      it.appendChild(inner);
      panel.appendChild(it); items.push({ it, inner });
    }
    wrap2.appendChild(panel); wrap1.appendChild(wrap2); app.appendChild(wrap1);
    await tick(); pump(); await tick();

    // Focus a descendant: panel must be discovered by ancestor walk.
    items[1].inner.focus();
    await tick();
    t('panel detected by focus (ancestor walk)', ryd.panelElement === panel,
      ryd.panelElement ? ryd.panelElement.tagName : 'null');
    t('panel marked focused', ryd.isPanelFocused === true);
    t('menu item resolved from a focused child',
      ryd.lastFocusedElement === items[1].it,
      ryd.lastFocusedElement ? ryd.lastFocusedElement.getAttribute('role') : 'null');

    // Arrow key navigation still moves within the panel.
    // jsdom makes Event#isTrusted an unforgeable own property, so a dispatched
    // event can never look like a real remote press. Call the handler directly
    // with a plain object for the "real press" cases; the dispatch path is still
    // exercised by the synthetic-marker case below.
    const key = (code, synthetic) => {
      const e = { isTrusted: true, keyCode: code,
                  key: code === 40 ? 'ArrowDown' : code === 38 ? 'ArrowUp' : 'Enter',
                  preventDefault() {}, stopPropagation() {} };
      if (synthetic) e.__ytngSynthetic = true;
      ryd.handleNavigation(e);
      return e;
    };
    const before = ryd.focusedIndex;
    key(40);   // ArrowDown
    await tick();
    t('ArrowDown advances the focused item', ryd.focusedIndex === (before + 1) % 4,
      `${before} -> ${ryd.focusedIndex}`);

    // A key this mod synthesised must be ignored - both via the direct call and
    // through a real dispatched event carrying the marker.
    const idx = ryd.focusedIndex;
    key(40, true);
    await tick();
    t('mod-synthesised ArrowDown is ignored (marker)', ryd.focusedIndex === idx,
      `${idx} -> ${ryd.focusedIndex}`);

    const de = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(de, 'keyCode', { get: () => 40, configurable: true });
    de.__ytngSynthetic = true;
    d.activeElement.dispatchEvent(de);
    await tick();
    t('mod-synthesised ArrowDown ignored through real dispatch',
      ryd.focusedIndex === idx, `${idx} -> ${ryd.focusedIndex}`);

    // Focus leaving the panel clears the flag.
    const outside = d.createElement('div');
    outside.setAttribute('tabindex', '0');
    app.appendChild(outside);
    outside.focus();
    await tick();
    t('focus outside the panel clears isPanelFocused', ryd.isPanelFocused === false);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 500);
