/**
 * "YouTube Next-Gen" item at the top of YouTube's own Settings screen, so the
 * NG settings can be reached without colour buttons on the remote.
 *
 * YouTube builds that screen from the account/get_setting response, which it
 * parses with JSON.parse. The wrapper below adds one settingActionRenderer to
 * the first category. Its serviceEndpoint is a command YouTube does not know;
 * the resolveCommand hook turns it into "open the NG settings panel".
 *
 * Import order matters: this module has to run before adblock.js. adblock
 * captures JSON.parse when it installs its hook and puts that value back when
 * Ad Blocking is switched off, so a wrapper installed after it would be lost
 * on that toggle. Keep the imports here free of ui.js / adblock.js for the
 * same reason.
 *
 * If YouTube changes the response shape the item just does not show up; the
 * green button and the number-key shortcuts keep working.
 */
import { ResolveCommandRegistry } from './app_api/index';
import { t } from './i18n/index.js';
import pictureUrl from './icons/settings-entry.png';

const ITEM_ID = 'YTNG_SETTINGS';
const COMMAND = 'ytngOpenSettingsCommand';

const runs = (text) => ({ runs: [{ text }] });

function buildItem() {
  return {
    settingActionRenderer: {
      title: runs('YouTube Next-Gen'),
      summary: runs(t('Ad blocking, SponsorBlock, playback speed, OLED black and interface. The green button on the remote opens them too.')),
      actionLabel: runs(t('Open settings')),
      serviceEndpoint: { [COMMAND]: {} },
      itemId: ITEM_ID,
      thumbnail: { thumbnails: [{ url: pictureUrl, width: 240, height: 240 }] }
    }
  };
}

function addItem(data) {
  for (let i = 0; i < data.items.length; i++) {
    const category = data.items[i] && data.items[i].settingCategoryCollectionRenderer;
    if (!category || !Array.isArray(category.items)) continue;
    const present = category.items.some((it) =>
      it && it.settingActionRenderer && it.settingActionRenderer.itemId === ITEM_ID);
    if (!present) category.items.unshift(buildItem());
    return;
  }
}

// Always installed (the item is always wanted), so the hot path has to stay
// at one call frame and a length check: YouTube parses thousands of small
// blobs, and the settings response is several kilobytes.
const innerParse = JSON.parse;
JSON.parse = function (text, reviver) {
  if (typeof text !== 'string' || text.length < 1000) return innerParse.call(this, text, reviver);
  const data = innerParse.call(this, text, reviver);
  if (data && data.responseContext && Array.isArray(data.items) &&
      data.items[0] && data.items[0].settingCategoryCollectionRenderer) {
    try { addItem(data); }
    catch (e) { console.warn('[settings-entry] item not added:', e); }
  }
  return data;
};

ResolveCommandRegistry.getInstance()
  .then((registry) => registry.setHook(COMMAND, () => {
    // ui.js publishes the opener; it is always loaded by the time the user
    // can reach the Settings screen.
    if (typeof window.ytng_showOptionsPanel === 'function') window.ytng_showOptionsPanel(true);
    return true;
  }))
  .catch((e) => {
    console.warn('[settings-entry] command hook not installed:', e);
  });
