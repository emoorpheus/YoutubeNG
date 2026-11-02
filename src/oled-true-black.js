/**
 * True Black OLED preset.
 *
 * Gated by the existing "OLED-Care Mode" switch (html.oled-theme-active), so
 * turning that switch off restores YouTube's stock colours with no reload.
 *
 * Two parts:
 *  1. oled-true-black.css - static rules on stable selectors.
 *  2. A palette sweep over YouTube's own stylesheets (below). YouTube TV paints
 *     its surfaces (#0f0f0f page, #181818 raised, #212121 menus) from ~120
 *     rules behind obfuscated class names that change with every YouTube
 *     release. Chasing those names breaks on the next update, so instead every
 *     rule whose background is one of those surface greys is rewritten to
 *     #000, and the gradient photos YouTube uses as full-screen backdrops are
 *     dropped. Rules for :hover / :focus states are left alone so focus
 *     feedback never disappears. Colour gradients are never touched: the red
 *     progress bars are drawn with them.
 *     Only colours that were already opaque change, so nothing new can end up
 *     painted over the video plane.
 */
import { configRead, configAddChangeListener } from './config.js';
import './oled-true-black.css';

const SURFACE_GREYS = {
  'rgb(15, 15, 15)': true,
  'rgb(18, 18, 18)': true,
  'rgb(24, 24, 24)': true,
  'rgb(28, 28, 28)': true,
  'rgb(33, 33, 33)': true
};
const STATE_SELECTOR = /:hover|:focus|:active|zylon-focus/;
const BACKDROP_IMAGE = /gstatic\.com\/ytlr\/img\/[^)]*gradient/i;

let enabled = false;
let observer = null;
const swept = [];   // stylesheets already processed while enabled
const patched = []; // { style, prop, value, priority } - originals, for restore

function patch(style, prop, value) {
  patched.push({
    style,
    prop,
    value: style.getPropertyValue(prop),
    priority: style.getPropertyPriority(prop)
  });
  style.setProperty(prop, value, 'important');
}

function sweepRules(rules) {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const style = rule.style;
    if (!style) {
      if (rule.cssRules) sweepRules(rule.cssRules); // @media / @supports
      continue;
    }
    if (!rule.selectorText || STATE_SELECTOR.test(rule.selectorText)) continue;
    if (SURFACE_GREYS[style.backgroundColor]) patch(style, 'background-color', '#000');
    if (BACKDROP_IMAGE.test(style.backgroundImage)) patch(style, 'background-image', 'none');
  }
}

function sweepSheet(sheet) {
  if (!sheet || swept.indexOf(sheet) !== -1) return;
  let rules;
  try { rules = sheet.cssRules; } catch { return; } // cross-origin sheet
  if (!rules) return;
  swept.push(sheet);
  sweepRules(rules);
}

function sweepAll() {
  const sheets = document.styleSheets;
  for (let i = 0; i < sheets.length; i++) sweepSheet(sheets[i]);
}

function onHeadMutation(mutations) {
  for (let i = 0; i < mutations.length; i++) {
    const added = mutations[i].addedNodes;
    for (let j = 0; j < added.length; j++) {
      const node = added[j];
      const el = node.nodeType === 1 ? node : node.parentNode;
      if (!el || (el.tagName !== 'STYLE' && el.tagName !== 'LINK')) continue;
      if (el.sheet) sweepSheet(el.sheet);
      else el.addEventListener('load', () => enabled && sweepSheet(el.sheet), { once: true });
    }
  }
}

function setTrueBlack(on) {
  on = !!on;
  if (on === enabled) return;
  enabled = on;
  if (on) {
    sweepAll();
    if (!observer && document.head) {
      observer = new MutationObserver(onHeadMutation);
      observer.observe(document.head, { childList: true, subtree: true });
    }
    // YouTube keeps loading styles for a while after start-up.
    window.addEventListener('load', () => enabled && sweepAll(), { once: true });
    return;
  }
  if (observer) { observer.disconnect(); observer = null; }
  while (patched.length) {
    const p = patched.pop();
    if (p.value) p.style.setProperty(p.prop, p.value, p.priority);
    else p.style.removeProperty(p.prop);
  }
  swept.length = 0;
}

setTrueBlack(configRead('enableOledCareMode'));
configAddChangeListener('enableOledCareMode', (evt) => setTrueBlack(evt.detail.newValue));
