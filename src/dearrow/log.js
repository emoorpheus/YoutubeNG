// The logger of the DeArrow modules: debug lines, tagged [DeArrow], only while DEBUG is on.
const DEBUG = false;

export const log = {
  debug: DEBUG ? (...args) => console.log('[DeArrow]', ...args) : () => {}
};
