// Every stylesheet of the bundle in one <style> element (from youtube-webos
// 0.8.5 beta 2). Each CSS import hands its text here while its module is
// evaluated (tools/css-collect-loader.cjs), in import order, and the text is
// written once the bundle has run: one sheet, parsed once, instead of a
// <style> per stylesheet. The element goes in with the first stylesheet, where
// the first of those went, so the styles the code adds later still come after it.
const pending = [];
const atImports = [];
let style = null;

/** Writes every queued stylesheet into the element. */
function writePending() {
  // An @import only counts before every other rule of the sheet.
  style.textContent = atImports.join('') + pending.join('');
  pending.length = 0;
  atImports.length = 0;
}

/**
 * Queues a stylesheet's text, and its @import rules if it has any; the first
 * one puts the element in and schedules the write, after the bundle's run.
 */
export function addStyle(css, imports) {
  if (!style) {
    style = document.createElement('style');
    (document.head || document.documentElement).appendChild(style);
  }
  if (pending.length === 0) Promise.resolve().then(writePending);
  pending.push(css);
  if (imports) atImports.push(imports);
}
