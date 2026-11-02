# Changelog

## 1.0.0 — pre-release

First version of YouTube Next-Gen, built on youtube-webos (NicholasBly 0.8.4) with playback speed from the Schmiddisen fork.

- Separate app: ID `youtube.nextgen`, title "YouTube Next-Gen"; installs next to the official YouTube.
- Interface in English and Russian: settings, notifications, SponsorBlock, first-launch hint. Follows YouTube's language by default; **Interface language** in Main → Interface switches it at once.
- "YouTube Next-Gen" item at the top of YouTube's own Settings opens the panel, so colour buttons are not needed.
- One-time first-launch hint showing where the settings are; no per-launch toast.
- Remote **Back** closes the settings panel (as do Esc and the green button).
- OLED true-black mode and a minimal settings panel.
- New icon (variant C, "OLED outline"); nine variants and a launcher mock-up in `design/icons/`, one script draws them all.
- Translations are plain data files: `src/i18n/template.js` has every English text, `tools/i18n.cjs` starts a new language, syncs and checks it (`npm run i18n:check`, also in CI); how to translate with an AI chat in `TRANSLATING.md`.
- The settings heading shows the version.
- From youtube-webos 0.8.5 beta 2 (NicholasBly; see `docs/upstream.md`):
  - SponsorBlock keeps working after switching to another app and back (PR #197).
  - Home screen rows are no longer dropped with Reduce Telemetry (PR #196).
  - A video frozen after a video screensaver recovers in seconds (PR #198).
  - Playback speed: above 1.25× Force Max Quality waits and the next video is held at 1080p too; after a speed change the position is kept on webOS 25; fixes in the speed engine (audio memory, cleanup, errors).
- Two installers: `_all.ipk` (webOS 3+) and `_all_webOS22+.ipk` (webOS 22+, smaller); `npm run package:all` builds both.
- Smaller package: images re-encoded (preview 29 → 9 KB, splash 11 KB → 0.3 KB, Settings picture 13 → 2.5 KB); 146 KB → 119 KB, 92 KB for webOS 22+.
