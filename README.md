# YouTube Next-Gen for LG webOS

[Русская версия](README.ru.md)

A separate YouTube app for LG webOS TVs: no ads, SponsorBlock, Return YouTube Dislike, playback speed, true-black OLED mode, and settings in English or Russian.

- App ID `youtube.nextgen`. It installs next to the official YouTube app and replaces nothing.
- Settings: in YouTube open the menu on the left → **Settings** → **YouTube Next-Gen** (the first item) → **Open settings**. If your remote has colour buttons, the **green** one opens them straight away. **Back** closes them.

## Features

- Ad blocking; optionally less telemetry.
- SponsorBlock: skips sponsor segments and other segment types.
- Return YouTube Dislike.
- Playback speed from the remote and YouTube's own Speed menu (webOS 23+); above 1.25× the video stays at 1080p.
- OLED mode: pure black (#000) instead of grey backgrounds.
- A minimal settings panel; settings, notifications and the SponsorBlock window in English or Russian.
- Hide Shorts, live streams and end cards; thumbnail and video quality; skip the "Who's watching?" screen.

## Language

English and Russian. By default the app follows the language YouTube is shown in (**Auto**). To change it: settings → **Main** → **Interface** → **Interface language** (Auto / English / Русский). The panel switches at once; the YouTube Next-Gen item in YouTube's own Settings follows after the app is restarted.

Other languages: each one is a single file in `src/i18n/`, easy to translate with an AI chat. See [TRANSLATING.md](TRANSLATING.md).

## Which file to install

| File | TVs |
|---|---|
| `youtube.nextgen_1.0.0_all_webOS22+.ipk` | webOS 22 and newer (2022+ TVs). Smaller and faster. |
| `youtube.nextgen_1.0.0_all.ipk` | any webOS from 3.x, including older TVs. |

## Installation

The TV needs Developer Mode or root.

With the webOS CLI:

```sh
ares-install -d tv youtube.nextgen_1.0.0_all_webOS22+.ipk
ares-launch -d tv youtube.nextgen
```

With root over SSH:

```sh
scp youtube.nextgen_1.0.0_all_webOS22+.ipk root@TV_IP:/tmp/ng.ipk
ssh root@TV_IP 'luna-send -i luna://com.webos.appInstallService/dev/install "{\"id\":\"youtube.nextgen\",\"ipkUrl\":\"/tmp/ng.ipk\",\"subscribe\":true}"'
```

Uninstall: `ares-install -d tv -r youtube.nextgen`.

## Building

Node.js 22+.

```sh
npm ci
npm run package:all    # -> dist/youtube.nextgen_1.0.0_all.ipk and ..._all_webOS22+.ipk
npm run deploy -- -d tv
npm run launch -- -d tv
```

`npm run build` / `npm run build:modern` + `npm run package` build one of them. The app ID and version live in `assets/appinfo.json`; `npm version` syncs the version from `package.json`.

## Icon

`design/icons/generate.py` draws all icon variants (`design/icons/variants.png`, in the launcher: `design/icons/launcher.png`) and, for the chosen one, everything the app ships: icons, preview, splash and the picture of the item in YouTube's Settings. Default is **C** (OLED outline). To switch:

```sh
python3 design/icons/generate.py I
npm run package:all
```

## Good to know

- A separate app has its own storage: sign in to YouTube and set things up again.
- The YouTube button on the remote opens the official app. With both installed, casting from a phone may open either one.

## For developers

[AGENTS.md](AGENTS.md) (also read by Claude Code through [CLAUDE.md](CLAUDE.md)) has the layout, commands and rules; [docs/upstream.md](docs/upstream.md) lists what is ported from youtube-webos 0.8.5.

## Licence

GPL-3.0-only, see `LICENSE` and `NOTICE`. YouTube is a trademark of Google LLC; this project is not affiliated with Google or LG.
