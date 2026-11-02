import { AudioEngine } from './speed/audio-engine.js';
import { installMseHook, isSupportedSpeed, SUPPORTED_SPEEDS } from './speed/mse-hook.js';
import { showNotification } from './notifications.js';
import { configRead } from './config.js';
import { SELECTORS } from './utils.js';
import { setQualityCappedBySpeed } from './speed-cap.js';

export const SPEED_BUTTON_TYPE = 'TRANSPORT_CONTROLS_BUTTON_TYPE_SPEED_BUTTON';
export const SPEED_OVERLAY_TYPE = 'CLIENT_OVERLAY_TYPE_VIDEO_PLAYBACK_SPEED';

export function enableSpeedButton(response) {
  const holder =
    response && response.transportControls
      ? response
      : response &&
        response.playerOverlays &&
        response.playerOverlays.playerOverlayRenderer;
  const renderer =
    holder &&
    holder.transportControls &&
    holder.transportControls.transportControlsRenderer;
  if (!renderer || typeof renderer !== 'object') return 0;
  let enabled = 0;
  for (const key of Object.keys(renderer)) {
    const actions = renderer[key];
    if (!Array.isArray(actions)) continue;
    for (const action of actions) {
      if (!action || action.type !== SPEED_BUTTON_TYPE) continue;
      const button = action.button && action.button.buttonRenderer;
      if (!button || !button.isDisabled) continue;
      button.isDisabled = false;
      if (!button.command) {
        button.command = {
          openClientOverlayAction: { type: SPEED_OVERLAY_TYPE }
        };
      }
      enabled++;
    }
  }
  return enabled;
}

export function installSpeedButtonPatch(win, isOn) {
  const json = win.JSON || JSON;
  const original = json.parse;
  const patched = function () {
    const r = original.apply(this, arguments);
    if (
      r &&
      typeof r === 'object' &&
      (r.transportControls ||
        (r.playerOverlays &&
          r.playerOverlays.playerOverlayRenderer &&
          r.playerOverlays.playerOverlayRenderer.transportControls)) &&
      isOn()
    ) {
      enableSpeedButton(r);
    }
    return r;
  };
  json.parse = patched;
  return () => {
    if (json.parse === patched) json.parse = original;
  };
}

export function enableNativeSpeedMenu(win) {
  const proto = (win.Object || Object).prototype;
  const previous = Object.getOwnPropertyDescriptor(proto, 'enableSpeedOptions');
  Object.defineProperty(proto, 'enableSpeedOptions', {
    configurable: true,
    enumerable: false,
    get() {
      return true;
    },
    set(value) {
      Object.defineProperty(this, 'enableSpeedOptions', {
        value,
        writable: true,
        configurable: true,
        enumerable: true
      });
    }
  });
  return () => {
    if (previous) Object.defineProperty(proto, 'enableSpeedOptions', previous);
    else delete proto.enableSpeedOptions;
  };
}

export function hookRateAssignments(win, controller, now = () => Date.now()) {
  const proto = (win.Object || Object).prototype;
  const previous = Object.getOwnPropertyDescriptor(proto, 'setPlaybackRate');
  Object.defineProperty(proto, 'setPlaybackRate', {
    configurable: true,
    enumerable: false,
    get() {
      return undefined;
    },
    set(fn) {
      if (Object(this) !== this) return;
      const plain =
        Object.getPrototypeOf(this) === proto &&
        !Object.hasOwn(this, 'constructor');
      Object.defineProperty(this, 'setPlaybackRate', {
        value:
          plain && typeof fn === 'function'
            ? wrapRate(fn, controller, now)
            : fn,
        writable: true,
        configurable: true,
        enumerable: true
      });
    }
  });
  return () => {
    if (previous) Object.defineProperty(proto, 'setPlaybackRate', previous);
    else delete proto.setPlaybackRate;
  };
}

export function bindPlayerRate(player, controller, now = () => Date.now()) {
  if (
    !player ||
    typeof player.setPlaybackRate !== 'function' ||
    player.__ytngSpeedBound
  )
    return false;
  const original = player.setPlaybackRate;
  player.__ytngOriginalSetPlaybackRate = original.__ytngUnwrapped || original;
  if (!original.__ytngUnwrapped)
    player.setPlaybackRate = wrapRate(original, controller, now);
  player.__ytngSpeedBound = true;
  return true;
}

function wrapRate(original, controller, now) {
  if (original.__ytngUnwrapped) return original;
  const wrapped = function (rate) {
    const result = original.apply(this, arguments);
    const r = Number(rate);
    const sinceReload = now() - controller.lastReloadAt();
    if (
      isSupportedSpeed(r) &&
      r !== controller.getSpeed() &&
      sinceReload > IGNORE_AFTER_RELOAD_MS
    ) {
      controller.setSpeed(r, { immediate: true });
    }
    return result;
  };
  wrapped.__ytngUnwrapped = original;
  return wrapped;
}

export const IGNORE_AFTER_RELOAD_MS = 3000;

export const SPEEDS = [1, 1.25, 1.5, 1.75, 2];

export const RELOAD_DELAY_MS = 800;

// Above this speed the video plays at 1080p at most: a TV cannot decode 2160p
// fast enough (at 1.5x it dropped 85% of the frames and reached 1.43x).
export const CAP_ABOVE = 1.25;

const PLAYING = 1;
const ABOVE_1080 = ['highres', 'hd2160', 'hd1440'];

/**
 * On webOS 25 loadVideoById(id, at) starts up to ~25 s before `at`, even at
 * 1x: once the reloaded video plays it is sent back to `at`. When `capped()`
 * the 1080p cap is set again too: the reload drops it. Ported from YTAF 0.8.5
 * beta 2 (features/playback-speed/controller.js).
 */
function restorePosition(win, player, at, capped) {
  if (typeof player.getPlayerState !== 'function' || typeof win.setInterval !== 'function') return;
  let tries = 40;
  const timer = win.setInterval(() => {
    let state;
    let now;
    try {
      state = player.getPlayerState();
      now = player.getCurrentTime();
    } catch {
      state = null;
    }
    if (state === PLAYING) {
      if (Math.abs(now - at) > 2) player.seekTo(at, true);
      if (capped()) player.setPlaybackQualityRange('hd1080', 'hd1080');
      win.clearInterval(timer);
    } else if (--tries <= 0 || state === null) {
      win.clearInterval(timer);
    }
  }, 250);
}

export function createSpeedController({ win, getPlayer, notify, configRead }) {
  let currentSpeed = 1;
  let activeSink = null;
  let pending = null;
  let lastReloadAt = 0;

  function isSupported() {
    return typeof win.AudioDecoder !== 'undefined';
  }

  function enabled() {
    return configRead('enablePlaybackSpeed') !== false;
  }

    function getSpeed() {
    return enabled() && isSupported() ? currentSpeed : 1;
  }

    // Records a new speed, and whether it holds the video at 1080p (speed-cap.js).
  function setCurrent(speed) {
    currentSpeed = speed;
    setQualityCappedBySpeed(speed > CAP_ABOVE);
  }

  function position(player) {
    try {
      return player.getCurrentTime();
    } catch {
      return 0;
    }
  }

  function scheduleReload(fromSpeed, immediate = false) {
    const player = getPlayer();
    if (!player) return;
    if (pending) {
      win.clearTimeout(pending.timer);
    } else {
      pending = { position: position(player), fromSpeed, timer: null };
    }
    if (immediate) {
      const p = pending;
      pending = null;
      applyReload(p);
      return;
    }
    pending.timer = win.setTimeout(() => {
      const p = pending;
      pending = null;
      applyReload(p);
    }, RELOAD_DELAY_MS);
  }

  function applyReload({ position: at, fromSpeed }) {
    // Back where the burst started: the playing MediaSource is already right.
    if (currentSpeed === fromSpeed) return;
    // Stop any previous Web Audio engine immediately so it doesn't keep playing
    // while the new MediaSource is being set up.
    releaseAudioSink();
    const player = getPlayer();
    if (!player) return;
    if (currentSpeed > CAP_ABOVE) {
      player.setPlaybackQualityRange('hd1080', 'hd1080');
    } else if (fromSpeed > CAP_ABOVE) {
      const quality = configRead('forceHighResVideo') ? 'highres' : 'auto';
      player.setPlaybackQualityRange(quality, quality);
    }
    const videoData = player.getVideoData && player.getVideoData();
    if (!videoData || !videoData.video_id) return;
    lastReloadAt = Date.now();
    player.loadVideoById(videoData.video_id, at);
    restorePosition(win, player, at, () => currentSpeed > CAP_ABOVE);
    // If YouTube's own menu is bound (native-menu.js), keep what it shows in
    // line with the real speed once the reloaded video has started.
    const setRate = player.__ytngOriginalSetPlaybackRate;
    if (setRate && typeof player.getPlaybackRate === 'function') {
      win.setTimeout(() => {
        try {
          if (player.getPlaybackRate() !== currentSpeed)
            setRate.call(player, currentSpeed);
        } catch {
          // The menu only shows a stale value; playback itself is unaffected.
        }
      }, 2500);
    }
  }

  function setSpeed(speed, { immediate = false } = {}) {
    if (speed === currentSpeed || !isSupportedSpeed(speed)) return;
    if (!enabled()) {
      notify('Playback speed is disabled in NG settings');
      return;
    }
    if (!isSupported()) {
      notify('Playback speed is not supported on this TV');
      return;
    }
    const previousSpeed = currentSpeed;
    setCurrent(speed);
    notify(`Playback speed ${speed}×`);
    scheduleReload(pending ? pending.fromSpeed : previousSpeed, immediate);
  }

  function cycle() {
    const idx = SPEEDS.indexOf(currentSpeed);
    const nextIdx = (idx + 1) % SPEEDS.length;
    setSpeed(SPEEDS[nextIdx]);
  }

  function step(dir) {
    let idx = SUPPORTED_SPEEDS.indexOf(currentSpeed);
    if (idx === -1) idx = SUPPORTED_SPEEDS.indexOf(1);
    const nextIdx = Math.min(
      SUPPORTED_SPEEDS.length - 1,
      Math.max(0, idx + (dir >= 0 ? 1 : -1))
    );
    setSpeed(SUPPORTED_SPEEDS[nextIdx]);
  }

  function reset() {
    setSpeed(1);
  }

    function onRateRequest() {}

  function onError(_err) {
    if (currentSpeed !== 1) {
      const previousSpeed = currentSpeed;
      setCurrent(1);
      notify('Playback speed not available for this video');
      scheduleReload(pending ? pending.fromSpeed : previousSpeed);
    }
  }

    function releaseAudioSink() {
    if (!activeSink) return;
    activeSink.engine.destroy();
    if (activeSink.element)
      activeSink.element.removeEventListener(
        'volumechange',
        activeSink.listener
      );
    activeSink = null;
  }

  function createAudioSink({ speed, element }) {
    releaseAudioSink();

    const engine = new AudioEngine({ win, speed, onError });
    if (element) {
      engine.attachVideo(element);
      engine.setVolume(element.volume, element.muted);
      const listener = () => {
        engine.setVolume(element.volume, element.muted);
      };
      element.addEventListener('volumechange', listener);
      activeSink = { engine, element, listener };
    } else {
      activeSink = { engine, element: null, listener: null };
    }
    return engine;
  }

  function handleKey(evt) {
    // NG's ui.js reads colour keys from charCode, the webOS docs from keyCode:
    // accept both.
    const code = evt.keyCode || evt.charCode;
    if (code === 405 || code === 170) {
      if (evt.type === 'keydown') {
        evt.preventDefault();
        if (evt.stopPropagation) evt.stopPropagation();
        // YouTube re-dispatches remote keys from its own listeners on document
        // (seen on the TV: one press cycled twice); ours runs first, so stop them.
        if (evt.stopImmediatePropagation) evt.stopImmediatePropagation();
        cycle();
        return true;
      } else if (evt.type === 'keypress' || evt.type === 'keyup') {
        evt.preventDefault();
        return true;
      }
    }
    return false;
  }

  return {
        activeEngine: () => (activeSink ? activeSink.engine : null),
    lastReloadAt: () => lastReloadAt,
    isSupported,
    getSpeed,
    setSpeed,
    cycle,
    step,
    reset,
    onRateRequest,
    onError,
    createAudioSink,
    releaseAudioSink,
    handleKey
  };
}

let speedInstance = null;

export function installSpeedFeature(win, { notify, configRead: cfgRead, getPlayer }) {
  if (
    typeof win.AudioDecoder === 'undefined' ||
    typeof win.AudioContext === 'undefined' ||
    typeof win.MediaSource === 'undefined'
  ) {
    return null;
  }

  const ctrl = createSpeedController({ win, getPlayer, notify, configRead: cfgRead });
  const mseHook = installMseHook(win, {
    getSpeed: ctrl.getSpeed,
    createAudioSink: ctrl.createAudioSink,
    onRateRequest: ctrl.onRateRequest,
    onError: ctrl.onError,
    onNativeAudio: ctrl.releaseAudioSink
  });

  const restoreMenu = enableNativeSpeedMenu(win);
  const restoreRateHook = hookRateAssignments(win, ctrl);
  const restoreButton = installSpeedButtonPatch(
    win,
    () => cfgRead('enablePlaybackSpeed') !== false
  );
  const bindTimer =
    typeof win.setInterval === 'function'
      ? win.setInterval(() => bindPlayerRate(getPlayer(), ctrl), 1000)
      : null;

  // The next video (autoplay, a tile) keeps the speed but starts at the
  // quality YouTube picks, 2160p on a 4K TV: capped once it plays.
  const stateHandler = (evt) => {
    const detail = evt.detail;
    if (!detail || detail.state !== PLAYING) return;
    if (!(ctrl.getSpeed() > CAP_ABOVE)) return;
    const player = getPlayer();
    try {
      if (player && ABOVE_1080.indexOf(player.getPlaybackQuality()) !== -1)
        player.setPlaybackQualityRange('hd1080', 'hd1080');
    } catch {
      // Not a full player API (yet): the next state change tries again.
    }
  };
  win.addEventListener('yt-player-state-change', stateHandler);

  const keyHandler = (evt) => ctrl.handleKey(evt);
  win.document.addEventListener('keydown', keyHandler, true);
  win.document.addEventListener('keypress', keyHandler, true);
  win.document.addEventListener('keyup', keyHandler, true);

  return {
    controller: ctrl,
    uninstall() {
      mseHook.uninstall();
      restoreMenu();
      restoreRateHook();
      restoreButton();
      if (bindTimer !== null) win.clearInterval(bindTimer);
      win.removeEventListener('yt-player-state-change', stateHandler);
      win.document.removeEventListener('keydown', keyHandler, true);
      win.document.removeEventListener('keypress', keyHandler, true);
      win.document.removeEventListener('keyup', keyHandler, true);
    }
  };
}

export function initPlaybackSpeed() {
  if (speedInstance || typeof window === 'undefined') return speedInstance;
  speedInstance = installSpeedFeature(window, {
    notify: showNotification,
    configRead,
    getPlayer: () =>
      document.getElementById(SELECTORS.PLAYER_ID) ||
      document.querySelector('.html5-video-player')
  });
  window.ytngSpeed = speedInstance ? speedInstance.controller : null;
  return speedInstance;
}

export function stepSpeed(direction) {
  initPlaybackSpeed()?.controller?.step(direction);
}

export function resetSpeed() {
  initPlaybackSpeed()?.controller?.reset();
}

initPlaybackSpeed();
