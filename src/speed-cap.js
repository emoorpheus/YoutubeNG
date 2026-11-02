// Whether playback speed holds the video at 1080p. Above 1.25x a TV cannot
// decode 2160p fast enough, so playback-speed.js caps the quality and Force Max
// Quality (video-quality.js) waits meanwhile. Ported from YTAF 0.8.5 beta 2
// (src/core/speed-cap.js, NicholasBly/youtube-webos).

let capped = false;

/** Whether the speed feature caps the quality now. */
export const isQualityCappedBySpeed = () => capped;

/** Set by the speed feature when its speed goes above or back under the cap. */
export function setQualityCappedBySpeed(on) {
  capped = !!on;
}
