/**
 * Spellcasting focus warning. A spellcasting focus or a component pouch stands in for a spell's material components
 * that have no cost. So a character casting such a spell with neither, no focus equipped and no component pouch
 * carried, is warned that they need the materials themselves. The spell is still cast.
 *
 * - A focus is any equipment, weapon or tool marked Focus, and counts only while equipped. Which kind of focus a class
 *   may use isn't checked.
 * - Materials with a cost can't be replaced by a focus, and a spell cast through a feature or an item rather than the
 *   character's own spellcasting may not need them, so neither is warned about. Nor are NPCs.
 */

import { MODULE_ID, localize } from "./hero-cards.mjs";

/**
 * The spellcasting methods whose spells need their components. Others, such as innate or at will, often don't.
 */
const SPELLCASTING = new Set(["spell", "pact"]);

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.once("init", registerSettings);
Hooks.on("dnd5e.preUseActivity", onPreUseActivity);

/**
 * Register the setting that turns the warning on.
 */
function registerSettings() {
  game.settings.register(MODULE_ID, "spellFocusWarning", {
    name: "STT.Settings.SpellFocusWarning.Name",
    hint: "STT.Settings.SpellFocusWarning.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });
}

/* -------------------------------------------- */

/**
 * Warn when a spell is cast without the focus or pouch its materials need.
 * @param {Activity} activity
 */
export function onPreUseActivity(activity) {
  if ( !game.settings.get(MODULE_ID, "spellFocusWarning") ) return;
  if ( !needsFocus(activity?.item) || hasFocus(activity.item.actor) ) return;
  ui.notifications.warn(localize("STT.SpellFocus.Warning", {
    name: activity.item.actor.name, spell: activity.item.name
  }));
}

/* -------------------------------------------- */

/**
 * @param {Item5e|void} item
 * @returns {boolean}  Whether it's a spell, cast by a character's own spellcasting, whose materials have no cost.
 */
export function needsFocus(item) {
  if ( (item?.type !== "spell") || (item.actor?.type !== "character") ) return false;
  if ( item.getFlag("dnd5e", "cachedFor") || !SPELLCASTING.has(item.system.method) ) return false;
  return item.system.properties.has("material") && !(item.system.materials?.cost > 0);
}

/* -------------------------------------------- */

/**
 * @param {Actor5e} actor
 * @returns {boolean}  Whether it has a focus equipped or carries a component pouch.
 */
export function hasFocus(actor) {
  return actor.items.some(i => (i.system.properties?.has("foc") && i.system.equipped)
    || ((i.type === "container") && (i.identifier === "component-pouch")));
}
