import { configRead, configAddChangeListener, configRemoveChangeListener } from './config';
import { debounce } from './utils';
import './watch.css';

// Display Time in UI: the time, or the date and time ('time' / 'datetime'), in
// the TV's language and its date order ("11/5 8:01 PM" in American English,
// "05.11 20:01" in Russian). Modes, the Intl fallback and the minute-aligned
// ticks are from upstream 0.8.5 b2 (#203).

/**
 * A formatter for `options` in the TV's language. A tag Intl refuses (a POSIX
 * suffix such as "en-US@posix") throws a RangeError, which would leave no
 * clock at all, so it falls back to the default locale.
 */
function createFormatter(options) {
  try {
    return new Intl.DateTimeFormat(navigator.language, options);
  } catch {
    return new Intl.DateTimeFormat(undefined, options);
  }
}

/**
 * The clock's text for `mode`, as a function of a Date. The date is its own
 * short format joined to the time by a space: formatted together, most
 * languages put a comma between them ("11/5, 8:01 PM").
 */
function createClockText(mode) {
  const time = createFormatter({ hour: 'numeric', minute: 'numeric' });
  if (mode !== 'datetime') return (now) => time.format(now);
  const date = createFormatter({ month: 'numeric', day: 'numeric' });
  return (now) => date.format(now) + ' ' + time.format(now);
}

class Watch {
  constructor(mode) {
    // Standard properties
    this.mode = mode;
    this._watch = null;
    this._timer = null;
    this._globalListeners = [];
    
    // Constants
    this._PLAYER_SELECTOR = 'ytlr-watch-default'; // Kept specific to this clock feature if needed, or could use SELECTORS.PLAYER_CONTAINER if appropriate.
    this._DEBOUNCE_DELAY = 50;
	this._cachedPlayer = null;
    this._cachedOverlay = null;

    // Bind methods
    this.onOledChange = this.onOledChange.bind(this);
    this.updateVisibility = this.updateVisibility.bind(this);
    
    // Use shared debounce
    this.debouncedUpdate = debounce(this.updateVisibility, this._DEBOUNCE_DELAY);

    // Initialize
    this.createElement();
    this.startClock();
    this.setupGlobalListeners();
    
    this.applyOledMode(configRead('enableOledCareMode'));
    configAddChangeListener('enableOledCareMode', this.onOledChange);

    // Initial check
    this.updateVisibility();
  }

  onOledChange(evt) {
    this.applyOledMode(evt.detail.newValue);
  }

  applyOledMode(enabled) {
    if (this._watch) {
      this._watch.classList.toggle('oled-mode', enabled);
    }
  }

  createElement() {
    this._watch = document.createElement('div');
    this._watch.className = 'webOs-watch';
    // Accessibility helper
    this._watch.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this._watch);
  }

  startClock() {
    // Intl is supported in Chrome 24+, safe for webOS 3
    const clockText = createClockText(this.mode);

    const setTime = () => {
      if (this._watch) {
        // textContent is faster than innerText
        this._watch.textContent = clockText(new Date());
        
        // Safety check on the minute mark
        this.updateVisibility();
      }
    };

    // Every tick is aimed at the next whole minute, so one that ran late
    // (timers held back in the background) does not shift the ones after it.
    const tick = () => {
      setTime();
      this._timer = setTimeout(tick, 60000 - (Date.now() % 60000));
    };
    tick();
    // Back in the foreground the time may be stale until the next tick.
    this.onVisibility = () => { if (!document.hidden) setTime(); };
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  updateVisibility() {
    if (!this._watch) return;

    if (!this._cachedPlayer || !this._cachedPlayer.isConnected) {
        this._cachedPlayer = document.querySelector(this._PLAYER_SELECTOR);
    }
    
    if (!this._cachedPlayer) {
      if (this._watch.style.display !== 'block') {
         this._watch.style.display = 'block';
      }
      return;
    }

    if (!this._cachedOverlay || !this._cachedOverlay.isConnected) {
        this._cachedOverlay = document.querySelector('.AmQJbe');
    }

    const isHybridFocused = this._cachedPlayer.getAttribute('hybridnavfocusable') === 'true';
    const isPlayerElementActive = document.activeElement === this._cachedPlayer || document.activeElement === document.body;
    const isOverlayActive = !!this._cachedOverlay;

    const shouldHide = isHybridFocused || isPlayerElementActive || isOverlayActive;
    
    const newDisplay = shouldHide ? 'none' : 'block';
    
    if (this._watch.style.display !== newDisplay) {
      this._watch.style.display = newDisplay;
    }
  }

  setupGlobalListeners() {
    this.boundStateChange = (e) => {
      const state = e.detail.state;
      if (state === 1 || state === 2 || state === -1) {
          this.debouncedUpdate();
      }
    };
    window.addEventListener('yt-player-state-change', this.boundStateChange);

    const addListener = (type, handler) => {
      document.addEventListener(type, handler, true);
      this._globalListeners.push({ type, fn: handler });
    };

    // focusin only: a focusout is followed by a focusin in every practical
    // case on this platform, and the callback is debounced at 50ms, so the
    // focusout invocation was always coalesced away. Halves the clock's share
    // of the per-keypress focus traffic.
    addListener('focusin', this.debouncedUpdate);
  }

  destroy() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    document.removeEventListener('visibilitychange', this.onVisibility);
    
    // Note: Debounce internal timer is managed by closure in shared helper, 
    // so strictly speaking we can't cancel it externally easily unless debounce returns a cancel method.
    // For this use case (UI visibility), letting a pending check run once after destroy is harmless, 
    // but the shared debounce usually doesn't expose cancel.
    // If strict cleanup is needed, update the shared debounce to return { run, cancel }.

    configRemoveChangeListener('enableOledCareMode', this.onOledChange);
    
    if (this.boundStateChange) {
        window.removeEventListener('yt-player-state-change', this.boundStateChange);
    }
    
    this._globalListeners.forEach(l => {
      document.removeEventListener(l.type, l.fn, true);
    });
    this._globalListeners = [];
    
    if (this._watch) {
      this._watch.remove();
      this._watch = null;
    }
  }
}

let watchInstance = null;

/** Creates, rebuilds or removes the clock for 'off', 'time' or 'datetime'. */
function setClockMode(mode) {
  const show = mode === 'time' || mode === 'datetime';
  if (watchInstance && (!show || watchInstance.mode !== mode)) {
    watchInstance.destroy();
    watchInstance = null;
  }
  if (show && !watchInstance) watchInstance = new Watch(mode);
}

setClockMode(configRead('showWatch'));

configAddChangeListener('showWatch', (evt) => {
  setClockMode(evt.detail.newValue);
});