/**
 * Behavioural test for arrow-key navigation inside the options panel.
 *
 * On the TV, Down from the SponsorBlock tab skipped the "SponsorBlock" checkbox
 * and landed on the first segment row, Down from the DeArrow tab skipped the
 * DeArrow checkboxes, and Down from the right column of "Cosmetic Filtering"
 * skipped the two checkbox rows below it. A move measured a checkbox by its
 * small box at the left edge of its row, which overlaps nothing above or below
 * it except what sits at that edge too, so a full-width cycle row further down
 * always won. A checkbox has to be measured by its whole label row.
 *
 * jsdom has no layout, so getBoundingClientRect is stubbed with the panel's TV
 * geometry: the tab bar at the top, then the open page's rows one below the
 * other - a label as wide as its row with a 20px checkbox box at its left, the
 * two-column section's labels half as wide. elementFromPoint answers from the
 * same geometry, so a navigation that hit-tests sees what the TV shows.
 *
 * Run: node bench/panel-nav-test.cjs [bundle] [legacy|modern]
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const bundlePath = process.argv[2] || 'dist/webOSUserScripts/userScript.js';
const modern = process.argv[3] === 'modern';
const KEY = { GREEN: 404, ENTER: 13, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40 };
const VIEW_W = 1920, VIEW_H = 2000;

// --- TV geometry (CSS px, measured on the webOS 25 TV) ---
const TAB_X = [[162, 310], [319, 496], [505, 640], [649, 780], [789, 960]];
const TAB_TOP = 129, TAB_BOTTOM = 171;
const PAGE_LEFT = 150, PAGE_RIGHT = 1002, PAGE_TOP = 192;
const ROW_L = 158, ROW_R = 994, ROW_H = 44, TITLE_H = 40, TEXT_H = 24;

const rect = (l, t, r, b) => ({ x: l, y: t, left: l, top: t, right: r, bottom: b, width: r - l, height: b - t });
const ZERO = rect(0, 0, 0, 0);

/** The rects of the open panel: tab buttons and the visible page's rows. */
function layout(doc) {
  const geo = new Map();
  const panel = doc.querySelector('.ytng-ui-container');
  if (!panel || panel.style.display === 'none') return geo;
  geo.set(panel, rect(140, 60, 1012, VIEW_H - 20));
  panel.querySelectorAll('.ytng-tab-btn').forEach((b, i) => {
    geo.set(b, rect(TAB_X[i][0], TAB_TOP, TAB_X[i][1], TAB_BOTTOM));
  });
  let page = null;
  panel.querySelectorAll('.ytng-settings-page').forEach((p) => { if (p.style.display !== 'none') page = p; });
  if (!page) return geo;

  let y = PAGE_TOP + 8;
  const row = (el, l, r) => {
    geo.set(el, rect(l, y, r, y + ROW_H));
    if (el.tagName !== 'LABEL') return;
    const content = el.querySelector('.label-content');
    if (content) geo.set(content, rect(l, y, r, y + ROW_H));
    const input = el.querySelector('input');
    if (input) geo.set(input, rect(l + 12, y + 12, l + 32, y + 32));
  };
  const isRow = (el) => el.tagName === 'LABEL' || el.classList.contains('shortcut-control-row');
  const walk = (container) => {
    for (const el of Array.from(container.children)) {
      const top = y;
      if (el.classList.contains('section-title')) {
        geo.set(el, rect(ROW_L, y, ROW_R, y + TITLE_H)); y += TITLE_H;
      } else if (isRow(el)) {
        row(el, ROW_L, ROW_R); y += ROW_H;
      } else if (el.classList.contains('ytng-section-2col')) {
        // flex-wrap, two labels per line: left, right, left, ...
        const mid = (ROW_L + ROW_R) / 2;
        let col = 0;
        for (const child of Array.from(el.children)) {
          if (!isRow(child)) { geo.set(child, rect(ROW_L, y, ROW_R, y + TITLE_H)); y += TITLE_H; continue; }
          row(child, col ? mid : ROW_L, col ? ROW_R : mid);
          if (col) y += ROW_H;
          col ^= 1;
        }
        if (col) y += ROW_H;
        geo.set(el, rect(ROW_L, top, ROW_R, y));
      } else if (el.children.length && Array.from(el.children).some(isRow)) {
        walk(el);   // a section or the segments' blockquote
        geo.set(el, rect(ROW_L, top, ROW_R, y));
      } else {
        geo.set(el, rect(ROW_L, y, ROW_R, y + TEXT_H)); y += TEXT_H;   // help text
      }
    }
  };
  walk(page);
  geo.set(page, rect(PAGE_LEFT, PAGE_TOP, PAGE_RIGHT, Math.max(860, y + 8)));
  return geo;
}

function boot() {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM('<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>',
    { runScripts: 'outside-only', url: 'https://www.youtube.com/tv', virtualConsole: vc, pretendToBeVisual: true });
  const win = dom.window;
  const doc = win.document;
  setUserAgent(win, modern ? UA.webos23 : UA.webos3);
  win.launchParams = '{}';
  win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };
  let rafQ = [];
  win.requestAnimationFrame = (cb) => { rafQ.push(cb); return rafQ.length; };
  win.cancelAnimationFrame = () => {};
  Object.defineProperty(win, 'innerWidth', { value: VIEW_W, configurable: true });
  Object.defineProperty(win, 'innerHeight', { value: VIEW_H, configurable: true });
  Object.defineProperty(doc.documentElement, 'clientWidth', { value: VIEW_W, configurable: true });
  Object.defineProperty(doc.documentElement, 'clientHeight', { value: VIEW_H, configurable: true });

  // Every rect is read from a fresh layout of the panel as it is right now.
  win.Element.prototype.getBoundingClientRect = function () {
    if (this === doc.documentElement || this === doc.body) return rect(0, 0, VIEW_W, VIEW_H);
    return layout(doc).get(this) || ZERO;
  };
  win.Element.prototype.scrollBy = function () {};
  win.Element.prototype.scrollIntoView = function () {};
  // The innermost laid-out element under the point.
  doc.elementFromPoint = (px, py) => {
    let hit = null, area = Infinity;
    for (const [el, r] of layout(doc)) {
      if (px < r.left || px > r.right || py < r.top || py > r.bottom) continue;
      if (r.width * r.height <= area) { hit = el; area = r.width * r.height; }
    }
    return hit || doc.body;
  };

  win.localStorage.setItem('ytng-configuration', win.JSON.stringify({
    enableAdBlock: true, enableSponsorBlock: true, enableDeArrow: true,
    dearrowCrowdTitles: true, dearrowCrowdThumbnails: true,
    enableReturnYouTubeDislike: false, upgradeThumbnails: false, enableAutoLogin: false
  }));
  if (!modern) applyChrome38Downgrade(win);
  win.eval(fs.readFileSync(bundlePath, 'utf8'));
  return { win, doc, errors, pump: () => { const q = rafQ; rafQ = []; for (const cb of q) cb(Date.now()); } };
}

/** A remote key, delivered where the TV delivers it: to the focused element. */
function key(win, code) {
  const doc = win.document;
  const target = doc.activeElement && doc.activeElement !== doc.documentElement ? doc.activeElement : doc.body;
  const e = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'keyCode', { get: () => code, configurable: true });
  target.dispatchEvent(e);
}

let pass = 0, fail = 0;
const t = (name, ok, extra) => {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? '\n     ' + extra : '')); }
};

setTimeout(() => {
  const { win, doc, errors, pump } = boot();
  key(win, KEY.GREEN);
  for (let i = 0; i < 20; i++) pump();
  const panel = doc.querySelector('.ytng-ui-container');
  t('panel open', !!panel && panel.style.display !== 'none');
  if (!panel) { console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1); }

  const tabs = Array.from(panel.querySelectorAll('.ytng-tab-btn'));
  const page = (id) => doc.querySelector('#ytng-page-' + id);
  const checkbox = (id, re) => {
    const label = Array.from(page(id).querySelectorAll('label')).find((l) => re.test(l.textContent));
    return label ? label.querySelector('input') : null;
  };
  const cycleRow = (id, re) => Array.from(page(id).querySelectorAll('.shortcut-control-row')).find((r) => re.test(r.textContent)) || null;
  const name = (el) => {
    if (!el) return 'nothing';
    if (el.classList && el.classList.contains('ytng-tab-btn')) return 'the ' + el.textContent + ' tab';
    const row = el.closest ? (el.closest('label') || el) : el;
    return '"' + (row.textContent || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 40) + '"';
  };
  /** Focus `from`, press `code`, expect the focus on `want` (or one of several). */
  const move = (label, from, code, want) => {
    const wants = [].concat(want);
    if (!from || wants.some((w) => !w)) { t(label, false, 'test setup: ' + (!from ? 'start' : 'target') + ' control not found'); return; }
    from.focus();
    key(win, code);
    const got = doc.activeElement;
    t(label, wants.indexOf(got) !== -1, 'landed on ' + name(got) + ', expected ' + wants.map(name).join(' or '));
  };

  // ---- Main page: the tab bar, the two-column section, the rows below ----
  const adBlock = checkbox('main', /Ad Block/i);
  const tracking = checkbox('main', /Tracking/i);
  const liveVideos = checkbox('main', /Live Videos/i);
  const topLive = checkbox('main', /Top Live/i);
  const mostRelevant = checkbox('main', /Most Relevant/i);
  const maxQuality = checkbox('main', /Force Max Quality/i);
  const speed = checkbox('main', /Playback Speed/i);
  const codec = cycleRow('main', /codec/i);
  const mainLast = (() => { const all = page('main').querySelectorAll('input:not([disabled]), .shortcut-control-row'); return all[all.length - 1]; })();

  t('the panel opens on the Main tab', doc.activeElement === tabs[0], 'focus on ' + name(doc.activeElement));
  move('Down from the Main tab: the first Main row', tabs[0], KEY.DOWN, adBlock);
  move('Right along the tab bar: Main to SponsorBlock', tabs[0], KEY.RIGHT, tabs[1]);
  move('Right from the last tab wraps to the first', tabs[4], KEY.RIGHT, tabs[0]);
  move('Left from the first tab wraps to the last', tabs[0], KEY.LEFT, tabs[4]);
  move('Down from the SponsorBlock tab while Main is open: Main\'s first row, not its first cycle row',
    tabs[1], KEY.DOWN, adBlock);
  move('Down from the DeArrow tab while Main is open: Main\'s first line', tabs[2], KEY.DOWN, [adBlock, tracking]);
  move('Right within a two-column line: Ad Blocking to Tracking Block', adBlock, KEY.RIGHT, tracking);
  move('Left within a two-column line: Tracking Block to Ad Blocking', tracking, KEY.LEFT, adBlock);
  move('Down within the right column: Tracking Block to Live Videos', tracking, KEY.DOWN, liveVideos);
  move('Down from the right column\'s last row: the checkbox row right below, not the codec row',
    mostRelevant, KEY.DOWN, maxQuality);
  move('Down from the left column\'s last row: the checkbox row right below', topLive, KEY.DOWN, maxQuality);
  move('Down from checkbox to checkbox: Force Max Quality to Playback Speed', maxQuality, KEY.DOWN, speed);
  move('Down from a checkbox to the cycle row below it', speed, KEY.DOWN, codec);
  move('Up from a cycle row to the checkbox above it', codec, KEY.UP, speed);
  move('Right on a cycle row steps its value and keeps the focus', codec, KEY.RIGHT, codec);
  move('Up from the first row: the open tab', adBlock, KEY.UP, tabs[0]);
  move('Up from the right column\'s first row: the open tab, not the nearest tab', tracking, KEY.UP, tabs[0]);
  move('Up from the open tab wraps to the page\'s last control', tabs[0], KEY.UP, mainLast);
  move('Down from the page\'s last control wraps to the open tab', mainLast, KEY.DOWN, tabs[0]);

  // Greyed-out rows are skipped: Ad Blocking off disables the rows below it.
  adBlock.focus();
  key(win, KEY.ENTER);
  t('Enter on Ad Blocking turns it off and greys the filters out',
    !adBlock.checked && topLive.disabled && mostRelevant.disabled, `checked=${adBlock.checked} disabled=${topLive.disabled}`);
  move('Down from Ad Blocking skips the greyed-out filter rows', adBlock, KEY.DOWN, maxQuality);
  adBlock.focus();
  key(win, KEY.ENTER);
  t('Enter on Ad Blocking turns it back on', adBlock.checked && !topLive.disabled);

  // ---- SponsorBlock page ----
  tabs[1].focus();
  key(win, KEY.ENTER);
  t('Enter on the SponsorBlock tab opens its page and keeps the focus on the tab',
    page('sponsor').style.display === 'block' && doc.activeElement === tabs[1], 'focus on ' + name(doc.activeElement));
  const sbEnable = checkbox('sponsor', /SponsorBlock/i);
  const sbFirstSegment = page('sponsor').querySelector('.shortcut-control-row');
  move('Down from the SponsorBlock tab: the SponsorBlock checkbox, not the first segment row',
    tabs[1], KEY.DOWN, sbEnable);
  move('Down from the SponsorBlock checkbox: the first segment row', sbEnable, KEY.DOWN, sbFirstSegment);
  move('Up from the SponsorBlock checkbox: the SponsorBlock tab', sbEnable, KEY.UP, tabs[1]);
  move('Down from the Main tab while SponsorBlock is open: the SponsorBlock checkbox', tabs[0], KEY.DOWN, sbEnable);

  // ---- DeArrow page ----
  tabs[2].focus();
  key(win, KEY.ENTER);
  t('Enter on the DeArrow tab opens its page', page('dearrow').style.display === 'block');
  const daEnable = checkbox('dearrow', /^\s*DeArrow\s*$/);
  const daBadge = page('dearrow').querySelectorAll('input[type="checkbox"]')[1];
  move('Down from the DeArrow tab: the DeArrow checkbox, not the first cycle row', tabs[2], KEY.DOWN, daEnable);
  move('Down from the DeArrow checkbox: the badge checkbox below it', daEnable, KEY.DOWN, daBadge);
  move('Up from the DeArrow checkbox: the DeArrow tab', daEnable, KEY.UP, tabs[2]);

  // ---- Shortcuts and UI Tweaks: rows only, or a mix ----
  tabs[3].focus();
  key(win, KEY.ENTER);
  move('Down from the Shortcuts tab: its first row', tabs[3], KEY.DOWN, page('shortcuts').querySelector('.shortcut-control-row'));
  tabs[4].focus();
  key(win, KEY.ENTER);
  const tweaksFirst = page('ui-tweaks').querySelector('input:not([disabled]), .shortcut-control-row');
  move('Down from the UI Tweaks tab: its first control', tabs[4], KEY.DOWN, tweaksFirst);

  t('no jsdomError', errors.length === 0, errors[0]);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 500);
