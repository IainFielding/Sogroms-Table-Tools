/**
 * Chat Button Labels
 *
 * Writes each icon button's label beside its icon on compact chat cards, so they can be
 * read without hovering for a tooltip.
 * The labels themselves are in styles/world-scripts.css, which only applies them while
 * the body carries the stt-chat-button-labels class.
 *
 * Carolingian UI labels the same buttons itself, or leaves them as icons, by a setting of its own, so with it enabled
 * these labels stay off: both at once would write every label twice.
 */

import { MODULE_ID } from "./hero-cards.mjs";

Hooks.once("init", registerSettings);
Hooks.once("ready", applyLabels);

/**
 * Register the setting that turns the labels on.
 */
function registerSettings() {
  game.settings.register(MODULE_ID, "chatButtonLabels", {
    name: "STT.Settings.ChatButtonLabels.Name",
    hint: "STT.Settings.ChatButtonLabels.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    onChange: applyLabels
  });
}

/* -------------------------------------------- */

/**
 * @returns {boolean}  Whether Carolingian UI is enabled, and so draws the buttons' labels itself.
 */
export function labelsSuperseded() {
  return !!game.modules.get("crlngn-ui")?.active;
}

/* -------------------------------------------- */

/**
 * Show or hide the labels to match the setting.
 */
function applyLabels() {
  const on = game.settings.get(MODULE_ID, "chatButtonLabels") && !labelsSuperseded();
  document.body.classList.toggle("stt-chat-button-labels", on);
}
