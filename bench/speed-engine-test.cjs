/**
 * Playback speed engine, straight from src/speed (no bundle, no DOM):
 *  - the video SourceBuffer patch only touches appends that start an init
 *    segment; media chunks, cut anywhere, go through untouched and never
 *    raise an error (TV test pre-release02: 50 fps VP9 dropped to 1x because
 *    ~2 % of WebM media chunks parsed as an impossible element size);
 *  - the audio engine survives losing its decoder in the background (TV test:
 *    back from Home the video played at 1x) and on a browser reclaim.
 * Usage: node bench/speed-engine-test.cjs
 */
const path = require('path');
const src = (p) => 'file://' + path.resolve(__dirname, '../src/speed', p);
let pass = 0, fail = 0;
const t = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok || x === undefined ? '' : ' ' + JSON.stringify(x))); };
const tick = () => new Promise((r) => setTimeout(r, 0));

(async () => {
  const { installMseHook } = await import(src('mse-hook.js'));
  const { findTimecodeScale } = await import(src('containers.js'));
  const { AudioEngine } = await import(src('audio-engine.js'));

  // ---------------------------------------------------------------- MSE hook
  class FakeSourceBuffer {
    constructor(mime) { this.mime = mime; this.appended = []; this._t = 0; this._ws = 0; this._we = Infinity; }
    appendBuffer(d) { this.appended.push(d); }
    remove() {}
    get timestampOffset() { return this._t; } set timestampOffset(v) { this._t = v; }
    get appendWindowStart() { return this._ws; } set appendWindowStart(v) { this._ws = v; }
    get appendWindowEnd() { return this._we; } set appendWindowEnd(v) { this._we = v; }
    get buffered() { return { length: 0, start() { return 0; }, end() { return 0; } }; }
  }
  class FakeMediaSource {}
  FakeMediaSource.prototype.addSourceBuffer = function (mime) { return new FakeSourceBuffer(mime); };
  const win = { MediaSource: FakeMediaSource, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, HTMLMediaElement: function () {}, EventTarget, Event };
  const errors = [];
  installMseHook(win, { getSpeed: () => 1.5, createAudioSink: () => null, onRateRequest() {}, onError: (e) => errors.push(e.message), onNativeAudio() {} });

  // Minimal WebM init: EBML header, Segment (unknown size), Info { TimecodeScale 1000000 }, Tracks.
  const webmInit = Uint8Array.from([
    0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x42, 0x86, 0x81, 0x01,
    0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0x15, 0x49, 0xa9, 0x66, 0x87, 0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40,
    0x16, 0x54, 0xae, 0x6b, 0x80
  ]);
  const random = (len) => { const u8 = new Uint8Array(len); for (let j = 0; j < len; j++) u8[j] = (Math.random() * 256) | 0; return u8; };
  const startsInit = (u8) => (u8[0] === 0x1a && u8[1] === 0x45 && u8[2] === 0xdf && u8[3] === 0xa3) ||
    ['ftyp', 'moov'].includes(String.fromCharCode(u8[4], u8[5], u8[6], u8[7]));

  for (const mime of ['video/webm; codecs="vp9"', 'video/mp4; codecs="av01.0.09M.08"']) {
    const sb = new FakeMediaSource().addSourceBuffer(mime);
    errors.length = 0;
    let untouched = 0, n = 0;
    for (let i = 0; i < 5000; i++) {
      const chunk = random(200 + ((Math.random() * 60000) | 0));
      if (startsInit(chunk)) continue;
      n++;
      sb.appendBuffer(chunk);
      if (sb.appended[sb.appended.length - 1] === chunk) untouched++;
    }
    t(mime.split(';')[0] + ': random media chunks raise no error', errors.length === 0, errors.slice(0, 3));
    t(mime.split(';')[0] + ': and go through untouched, appended once', untouched === n && sb.appended.length === n, { untouched, n, appended: sb.appended.length });
  }

  {
    const sb = new FakeMediaSource().addSourceBuffer('video/webm; codecs="vp9"');
    errors.length = 0;
    // As a view into a bigger buffer, the way an app may hand it over.
    const big = new Uint8Array(webmInit.length + 16); big.set(webmInit, 8);
    sb.appendBuffer(big.subarray(8, 8 + webmInit.length));
    const out = new Uint8Array(sb.appended[0]);
    const tc = findTimecodeScale(out);
    t('webm init (a view) is still rewritten for the speed', errors.length === 0 && tc && tc.value !== 1000000, { errors, tc: tc && tc.value });
    sb.appendBuffer(webmInit.subarray(0, 12)); // init cut short: cannot be rewritten
    t('an init split across appends is still reported', errors.length === 1 && /split/.test(errors[0]) && sb.appended.length === 2, errors);
  }

  // ------------------------------------------------------------- audio engine
  const doc = { hidden: false, listeners: [], addEventListener(type, fn) { this.listeners.push(fn); }, removeEventListener(type, fn) { this.listeners = this.listeners.filter((f) => f !== fn); } };
  const setHidden = (h) => { doc.hidden = h; doc.listeners.forEach((fn) => fn()); };
  const decoders = [];
  let contexts = 0;
  class FakeAudioContext {
    constructor() { contexts++; this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createGain() { return { connect() {}, gain: { value: 1 } }; }
    close() { this.state = 'closed'; return Promise.resolve(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }
  class FakeAudioDecoder {
    static isConfigSupported() { return Promise.resolve({ supported: true }); }
    constructor({ error }) { this.error = error; this.state = 'unconfigured'; decoders.push(this); }
    configure() { this.state = 'configured'; }
    decode() {}
    reset() {}
    close() { this.state = 'closed'; }
  }
  const awin = { document: doc, AudioContext: FakeAudioContext, AudioDecoder: FakeAudioDecoder, setInterval, clearInterval, setTimeout };
  const fatal = [];
  const engine = new AudioEngine({ win: awin, speed: 1.5, onError: (e) => fatal.push(e.name) });
  engine.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2 });
  await tick(); await tick();
  t('engine has a decoder', decoders.length === 1 && engine.decoder === decoders[0]);
  const reclaim = (d) => { d.state = 'closed'; d.error(Object.assign(new Error('Codec reclaimed due to background.'), { name: 'QuotaExceededError' })); };
  const bad = (d) => { d.state = 'closed'; d.error(Object.assign(new Error('Decoding error.'), { name: 'EncodingError' })); };

  setHidden(true);
  bad(decoders[0]); // any error in the background: not the data's fault, most likely webOS
  t('an error in the background does not drop the speed', fatal.length === 0 && !engine.failed && !!engine.lost, fatal);
  engine.ctx.state = 'closed';
  setHidden(false);
  await tick(); await tick();
  t('back in front: a new decoder and AudioContext', decoders.length === 2 && engine.decoder === decoders[1] && decoders[1].state === 'configured' && contexts === 2 && !engine.lost, { decoders: decoders.length, contexts });

  reclaim(decoders[1]); // the browser reclaiming an idle decoder, in front
  await tick(); await tick(); await tick();
  t('a reclaimed decoder is rebuilt in front too', fatal.length === 0 && decoders.length === 3 && engine.decoder === decoders[2], { fatal, decoders: decoders.length });

  reclaim(decoders[2]);
  await tick(); await tick(); await tick();
  reclaim(decoders[3]);
  await tick(); await tick(); await tick();
  t('a decoder that keeps failing falls back to 1x (3 rebuilds a minute)', fatal.length === 1 && engine.failed, { fatal, decoders: decoders.length });

  const engine2 = new AudioEngine({ win: awin, speed: 1.5, onError: (e) => fatal.push(e.name) });
  engine2.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2 });
  await tick(); await tick();
  bad(decoders[decoders.length - 1]);
  t('a real decoding error in front still falls back to 1x', fatal.length === 2 && fatal[1] === 'EncodingError' && engine2.failed, fatal);
  engine.destroy(); engine2.destroy();
  t('destroy removes the visibility listener', doc.listeners.length === 0, doc.listeners.length);

  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL crashed: ' + (e && e.stack)); process.exit(1); });
