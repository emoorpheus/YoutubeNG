/**
 * The webOS 3+ build asks Google Fonts for Noto Sans Arabic and Noto Sans Math
 * only where it uses them: on webOS 4 and older, whose fonts lack them
 * (src/emoji-font.js). On a newer webOS the same build makes no request to
 * Google. Usage: node bench/google-fonts-test.cjs <webOS 3+ bundle>
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const code = fs.readFileSync(process.argv[2] || 'dist/webOSUserScripts/userScript.js', 'utf8');
const tv = (year, chrome) => UA.webos3.replace('38.0.2125.122', chrome).replace('TV-2016', 'TV-' + year);
const cases = [
  ['webOS 3', UA.webos3, true],
  ['webOS 4', UA.webos4, true],
  ['webOS 5', tv(2020, '68.0.3440.106'), false],
  ['webOS 6', tv(2021, '79.0.3945.79'), false],
  ['webOS 23', UA.webos23, false]
];

function launch(userAgent) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><ytlr-app></ytlr-app></body></html>', {
    runScripts: 'outside-only', url: 'https://www.youtube.com/tv',
    virtualConsole: new VirtualConsole(), pretendToBeVisual: true
  });
  const win = dom.window;
  setUserAgent(win, userAgent);
  win.launchParams = '{}';
  win.XMLHttpRequest = class { open() {} send() {} setRequestHeader() {} getResponseHeader() { return null; } addEventListener() {} };
  if (userAgent === UA.webos3) applyChrome38Downgrade(win);
  win.eval(code);
  // The stylesheets are written once the bundle has run (src/styles.js).
  return new Promise((resolve) => setTimeout(() => {
    const doc = win.document;
    const links = doc.querySelectorAll('link[href^="https://fonts.googleapis.com/"]').length;
    const imports = Array.from(doc.querySelectorAll('style'))
      .filter((s) => s.textContent.indexOf('fonts.googleapis.com') !== -1).length;
    const legacyEmoji = doc.documentElement.classList.contains('ytng-legacy-emoji');
    win.close();
    resolve({ links, imports, legacyEmoji });
  }, 100));
}

(async () => {
  let fail = 0;
  const results = await Promise.all(cases.map(([, userAgent]) => launch(userAgent)));
  for (const [i, [name, , wanted]] of cases.entries()) {
    const r = results[i];
    const asks = r.links + r.imports;
    const ok = (wanted ? asks === 1 : asks === 0) && r.legacyEmoji === wanted;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: Google Fonts ${wanted ? 'once' : 'never'}` +
      ` (link ${r.links}, @import ${r.imports}, legacy emoji fix ${r.legacyEmoji ? 'on' : 'off'})`);
  }
  console.log(fail ? `\n${fail} failed` : `\nall ${cases.length} Google Fonts cases passed`);
  process.exit(fail ? 1 : 0);
})();
