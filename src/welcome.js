/**
 * One-time card on first launch: where the NG settings are.
 *
 * Not every remote has colour buttons, so "press green" is not enough on its
 * own. The settings are also the first item of YouTube's own Settings screen
 * (settings-entry.js); the card says so once, on the first visit to the home
 * screen (never over YouTube's welcome or account screens), and is remembered
 * in the config when it is dismissed.
 *
 * While the card is up, remote keys are taken at window capture so nothing
 * reaches YouTube behind it: OK presses the selected button, Back / Esc close
 * the card, Left / Right switch buttons. The green button closes it and is
 * passed on, so it does whatever it is mapped to (opens the panel by default).
 * The rest of the key press that closed the card (repeats, keyup) is eaten
 * too, otherwise YouTube would act on the release and open the focused tile.
 */
import './welcome.css';
import { configRead, configWrite } from './config.js';
import { COLOR_CODE_MAP, REMOTE_KEYS, SYNTHETIC_KEY_FLAG } from './utils.js';
import { t } from './i18n/index.js';
import pictureUrl from './icons/settings-entry.png';

const HOME_CLASS = 'WEB_PAGE_TYPE_BROWSE';
// Let the home screen settle (first shelves, focus) before covering it.
const SHOW_DELAY_MS = 1500;
// Safety net if the release of the closing key never arrives.
const RELEASE_TIMEOUT_MS = 1500;

const KEY_LEFT = REMOTE_KEYS.LEFT.code;
const KEY_RIGHT = REMOTE_KEYS.RIGHT.code;
const KEY_ENTER = REMOTE_KEYS.ENTER.code;
const CLOSE_KEYS = [REMOTE_KEYS.BACK.code, 27 /* Esc */, 8 /* Backspace */];

let overlay = null;
let buttons = [];
let selected = 0;
let heldKey = null;   // key that closed the card, eaten until released
let releaseTimer = null;
let showTimer = null;
let observer = null;

const isOnHome = () => {
  const body = document.body;
  return !!body && body.classList.contains(HOME_CLASS) &&
    !document.querySelector('ytlr-welcome');
};

const isPanelOpen = () => {
  const panel = document.querySelector('.ytng-ui-container');
  return !!panel && panel.style.display !== 'none';
};

function swallow(evt) {
  evt.preventDefault();
  evt.stopPropagation();
  if (evt.stopImmediatePropagation) evt.stopImmediatePropagation();
}

function select(index) {
  selected = index;
  for (let i = 0; i < buttons.length; i++) {
    if (i === index) buttons[i].classList.add('ytng-welcome-btn--focused');
    else buttons[i].classList.remove('ytng-welcome-btn--focused');
  }
}

function detachKeys() {
  window.removeEventListener('keydown', onKey, true);
  window.removeEventListener('keypress', onKey, true);
  window.removeEventListener('keyup', onKey, true);
  clearTimeout(releaseTimer);
  heldKey = null;
}

function close(openPanel, closingKey) {
  if (!overlay) return;
  if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  overlay = null;
  buttons = [];
  configWrite('firstRunHintShown', true);

  if (closingKey == null) detachKeys();
  else {
    heldKey = closingKey;
    releaseTimer = setTimeout(detachKeys, RELEASE_TIMEOUT_MS);
  }
  if (openPanel && typeof window.ytng_showOptionsPanel === 'function') {
    window.ytng_showOptionsPanel(true);
  }
}

function onKey(evt) {
  if (evt[SYNTHETIC_KEY_FLAG]) return; // keep-alive / auto-login keys are not the user
  const code = evt.keyCode || evt.which || evt.charCode;

  if (!overlay) {
    if (code === heldKey) {
      swallow(evt);
      if (evt.type === 'keyup') detachKeys();
    }
    return;
  }

  if (COLOR_CODE_MAP.get(code) === 'green') {
    if (evt.type === 'keydown') close(false, null);
    return; // not swallowed: ui.js runs the green-button action
  }

  swallow(evt);
  if (evt.type !== 'keydown' || evt.repeat) return;

  if (code === KEY_LEFT && selected > 0) select(selected - 1);
  else if (code === KEY_RIGHT && selected < buttons.length - 1) select(selected + 1);
  else if (code === KEY_ENTER) close(buttons[selected].getAttribute('data-action') === 'open', code);
  else if (CLOSE_KEYS.indexOf(code) !== -1) close(false, code);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function makeButton(label, action, index) {
  const btn = el('div', 'ytng-welcome-btn', label);
  btn.setAttribute('data-action', action);
  btn.addEventListener('mouseover', () => select(index));
  btn.addEventListener('click', (evt) => {
    swallow(evt);
    close(action === 'open', null);
  });
  return btn;
}

function show() {
  if (overlay) return;
  if (observer) { observer.disconnect(); observer = null; }

  overlay = el('div', 'ytng-welcome');
  overlay.setAttribute('role', 'dialog');
  const card = el('div', 'ytng-welcome-card');
  const picture = el('img', 'ytng-welcome-picture');
  picture.src = pictureUrl;
  picture.alt = '';
  card.appendChild(picture);
  card.appendChild(el('div', 'ytng-welcome-title', t('Where to find YouTube Next-Gen settings')));
  card.appendChild(el('div', 'ytng-welcome-text',
    t('Menu on the left, then Settings, then YouTube Next-Gen (the first item).')));
  card.appendChild(el('div', 'ytng-welcome-text ytng-welcome-text--muted',
    t('If your remote has colour buttons, the green one opens them straight away.')));

  const row = el('div', 'ytng-welcome-buttons');
  buttons = [makeButton(t('Got it'), 'close', 0), makeButton(t('Open settings'), 'open', 1)];
  buttons.forEach((b) => row.appendChild(b));
  card.appendChild(row);
  overlay.appendChild(card);
  // Pointer clicks next to the card must not reach the tiles behind it.
  overlay.addEventListener('click', swallow);

  document.body.appendChild(overlay);
  select(0);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keypress', onKey, true);
  window.addEventListener('keyup', onKey, true);
}

function scheduleShow() {
  if (showTimer || overlay || !isOnHome()) return;
  showTimer = setTimeout(() => {
    showTimer = null;
    // Still on home and nothing else on top? Otherwise wait for the next visit.
    if (isOnHome() && !isPanelOpen() && !configRead('firstRunHintShown')) show();
  }, SHOW_DELAY_MS);
}

function init() {
  if (configRead('firstRunHintShown')) return;
  // Body classes flip constantly (focus, animations); this callback is one
  // classList lookup and goes away for good once the card has been shown.
  observer = new MutationObserver(scheduleShow);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  scheduleShow();
}

if (document.body) init();
else document.addEventListener('DOMContentLoaded', init);
