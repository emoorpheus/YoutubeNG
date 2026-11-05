/**
 * Auto login on YouTube's "Who's watching" account selector.
 *
 * The bypass answers the selector with remote presses. Pressing OK is only
 * right when the focus is on what the bypass means to choose: a TV with no
 * account shows "Add account" focused, and OK there opens Google sign-in
 * instead of the video (seen on a webOS 25 TV after a deeplink). The guest
 * button is reached with DOWN, and that only works while the selector keeps its
 * layout: hiding it with display:none drops the focus and YouTube's spatial
 * navigation has nothing to move to.
 *
 * The page below models what the TV showed: tiles in ytlr-carousel-account,
 * the guest button as ytlr-button-renderer[idomkey=GuestButton], and the
 * component data YouTube hangs on each element (__instance.props.data), where
 * the "Add account" tiles carry a startSignInCommand. YouTube keeps its own
 * focus: OK acts on it even while the DOM focus is gone, DOWN needs a laid-out
 * selector.
 *
 * Usage: node bench/auto-login-test.cjs dist/webOSUserScripts/userScript.js [legacy|modern]
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const bundlePath = process.argv[2] || path.resolve(__dirname, '../dist/webOSUserScripts/userScript.js');
const mode = process.argv[3] || 'legacy';
const bundle = fs.readFileSync(bundlePath, 'utf8');
const WEBOS25 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WebAppManager webOS.TV-2025';
const SELECTOR_PAGE = 'WEB_PAGE_TYPE_ACCOUNT_SELECTOR';
const GUEST_ID = JSON.stringify({ data: { identityType: 'UNAUTHENTICATED_IDENTITY_TYPE_GUEST' } });
const ACCOUNT_ID = JSON.stringify({ data: { identityType: 'ANY_SIGNED_IN_IDENTITY' } });

function boot(opts) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM('<!doctype html><html><head></head><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>',
    { runScripts: 'outside-only', url: 'https://www.youtube.com/tv#/', virtualConsole: vc, pretendToBeVisual: true });
  const win = dom.window;
  const doc = win.document;
  setUserAgent(win, mode === 'modern' ? WEBOS25 : UA.webos3);
  win.launchParams = '{}';
  win.webOS = { deviceInfo: (cb) => cb({ modelName: 'sim' }), platformBack: () => {} };
  win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };
  win.fetch = () => Promise.reject(new Error('offline'));
  win.localStorage.setItem('ytng-configuration', JSON.stringify({
    enableAutoLogin: true, firstRunHintShown: true, enableSponsorBlock: false, enableReturnYouTubeDislike: false, enableDeArrow: false
  }));
  for (const k in opts.storage || {}) win.localStorage.setItem('yt.leanback.default::' + k, opts.storage[k]);
  if (mode !== 'modern') applyChrome38Downgrade(win);
  let threw = null;
  try { win.eval(bundle); } catch (e) { threw = e; }
  return { win, doc, errors, threw };
}

// The selector as the TV drew it, plus a model of YouTube's own focus.
function showSelector(env, opts) {
  const { win, doc } = env;
  const sel = doc.createElement('ytlr-account-selector');
  const list = doc.createElement('yt-virtual-list');
  sel.appendChild(list);
  const items = [];
  const tile = (label, kind) => {
    const el = doc.createElement('ytlr-tile-renderer');
    el.setAttribute('tabindex', '-1');
    el.setAttribute('role', 'button');
    const header = doc.createElement('ytlr-tile-header-renderer');
    // "Add account" is drawn with an icon; accounts and "Add kids account" with a picture.
    header.appendChild(doc.createElement(kind === 'add' ? 'yt-icon' : 'ytlr-thumbnail-details'));
    el.appendChild(header);
    const meta = doc.createElement('ytlr-tile-metadata-renderer');
    meta.textContent = label;
    el.appendChild(meta);
    if (opts.withData !== false) {
      const onSelectCommand = kind === 'account' ? { selectAccountCommand: {} } : { startSignInCommand: {} };
      el.__instance = { props: { data: { onSelectCommand } } };
    }
    const carousel = doc.createElement('ytlr-carousel-account');
    carousel.appendChild(el);
    list.appendChild(carousel);
    items.push({ el, label });
    return el;
  };
  const accounts = (opts.accounts || []).map((name) => tile(name, 'account'));
  const addAccount = tile('Add account', 'add');
  tile('Add kids account', 'addkids');
  const focusBox = doc.createElement('yt-focus-container');
  const guestRenderer = doc.createElement('ytlr-button-renderer');
  guestRenderer.setAttribute('idomkey', 'GuestButton');
  const guest = doc.createElement('yt-button-container');
  guest.setAttribute('tabindex', '-1');
  guest.setAttribute('role', 'button');
  guest.textContent = 'Continue as guest';
  guestRenderer.appendChild(guest);
  focusBox.appendChild(guestRenderer);
  sel.appendChild(focusBox);
  items.push({ el: guest, label: 'Continue as guest' });
  doc.querySelector('ytlr-app').appendChild(sel);

  let overlayButton = null;
  if (opts.overlay) {
    const overlay = doc.createElement('ytlr-overlay-panel-renderer');
    overlayButton = doc.createElement('ytlr-button');
    overlayButton.setAttribute('tabindex', '-1');
    overlayButton.textContent = 'Sign in on your phone';
    overlay.appendChild(overlayButton);
    doc.querySelector('ytlr-app').appendChild(overlay);
    items.push({ el: overlayButton, label: 'Sign in on your phone' });
  }

  const labelOf = (el) => { const it = items.find((i) => i.el === el); return it ? it.label : (el ? el.tagName.toLowerCase() : 'null'); };
  // YouTube's focus. It survives the DOM focus being dropped, so OK still acts on it.
  let focus = overlayButton || (accounts.length ? accounts[opts.focusIndex || 0] : addAccount);
  const laidOut = () => { const cs = win.getComputedStyle(sel); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const sync = () => {
    if (laidOut()) { if (doc.activeElement !== focus) focus.focus(); }
    else if (doc.activeElement && doc.activeElement !== doc.body) doc.activeElement.blur();
  };
  new win.MutationObserver(sync).observe(doc.body, { attributes: true, attributeFilter: ['class'] });
  focus.focus();

  const log = [];
  doc.addEventListener('keydown', (e) => {
    const code = e.keyCode;
    if (code === 13) { log.push('OK on ' + labelOf(focus)); return; }
    if (code === 40) {
      log.push('DOWN');
      // Spatial navigation needs geometry; the guest button sits under the tiles.
      if (opts.downWorks !== false && laidOut() && focus.tagName.toLowerCase() === 'ytlr-tile-renderer') { focus = guest; sync(); }
      return;
    }
    if (code === 38) {
      log.push('UP');
      if (laidOut() && focus === guest) { focus = accounts[0] || addAccount; sync(); }
      return;
    }
    log.push('key ' + code);
  });
  doc.body.className = SELECTOR_PAGE + ' landscape';
  return { log, hidden: () => doc.body.classList.contains('ytng-bypassing-login') };
}

const CASES = [
  { name: 'no account on the TV: "Add account" focused -> guest', storage: { AUTONAV_FOR_SIGN_OUT: '{"data":{"guest":true}}' },
    expect: (r) => r.oks.length === 1 && r.oks[0] === 'OK on Continue as guest' && r.downs >= 1 },
  { name: 'no account, no component data (older app): icon tile -> guest', withData: false,
    expect: (r) => r.oks.length === 1 && r.oks[0] === 'OK on Continue as guest' },
  { name: 'last used an account: OK on that account, no DOWN', accounts: ['Alice', 'Bob'], focusIndex: 1, storage: { 'last-identity-used': ACCOUNT_ID },
    expect: (r) => r.oks.length === 1 && r.oks[0] === 'OK on Bob' && r.downs === 0 },
  { name: 'last used guest with accounts present -> guest', accounts: ['Alice'], storage: { 'last-identity-used': GUEST_ID },
    expect: (r) => r.oks.length === 1 && r.oks[0] === 'OK on Continue as guest' },
  { name: 'accounts stored, only a stale guest setting: OK on the focused account', accounts: ['Alice'],
    storage: { 'available-identities': '{"data":{"g1":{"identityType":"ANY"}}}', AUTONAV_FOR_SIGN_OUT: '{"data":{"guest":true}}' },
    expect: (r) => r.oks.length === 1 && r.oks[0] === 'OK on Alice' && r.downs === 0 },
  { name: 'guest button never takes focus -> no OK at all, selector shown again', downWorks: false,
    expect: (r) => r.oks.length === 0 && !r.hiddenAtEnd },
  { name: 'focus on a sign-in overlay, not the selector -> no OK, selector shown again', overlay: true,
    expect: (r) => r.oks.length === 0 && !r.hiddenAtEnd },
];

let pass = 0, fail = 0;
const t = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  ' + JSON.stringify(x))); };

const envs = CASES.map((c) => boot(c));
let runs = [];
// The userscript starts on DOMContentLoaded; the selector comes after that.
setTimeout(() => {
  runs = CASES.map((c, i) => {
    const env = envs[i];
    const sel = showSelector(env, c);
    let wasHidden = false;
    const iv = setInterval(() => { if (sel.hidden()) wasHidden = true; }, 20);
    return { c, env, sel, iv, wasHidden: () => wasHidden };
  });
}, 500);

// The bypass waits for the selector, steps to its target and lets the page go
// within a few seconds; give it all of that.
setTimeout(() => {
  for (const { c, env, sel, iv, wasHidden } of runs) {
    clearInterval(iv);
    const r = { oks: sel.log.filter((l) => l.indexOf('OK on') === 0), downs: sel.log.filter((l) => l === 'DOWN').length,
      hiddenAtEnd: sel.hidden(), log: sel.log };
    t(c.name, !env.threw && c.expect(r), env.threw ? env.threw.message : r);
    if (c.name.indexOf('no account on the TV') === 0) t('the selector is hidden while the bypass runs', wasHidden());
  }

  // The guest-only options follow the same detection: on webOS 25 a guest has
  // no last-identity-used record, only the guest's signed-out autoplay setting.
  const env = guestEnv;
  const green = new env.win.KeyboardEvent('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(green, 'keyCode', { get: () => 404 });
  env.doc.body.dispatchEvent(green);
  const panel = env.doc.querySelector('.ytng-ui-container');
  t('a webOS 25 guest gets the guest-mode panel options', !!panel && panel.classList.contains('guest-mode'), panel && panel.className);

  console.log(pass + ' passed, ' + fail + ' failed (' + mode + ')');
  process.exit(fail ? 1 : 0);
}, 7000);
const guestEnv = boot({ storage: { AUTONAV_FOR_SIGN_OUT: '{"data":{"guest":true}}' } });
