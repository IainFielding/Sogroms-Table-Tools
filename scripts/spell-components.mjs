/**
 * Spell component warnings. D&D 5e lists a spell's components but checks none of them as it's cast, so the caster is
 * warned when one can't be provided. The spell is still cast. One setting turns both warnings on.
 *
 * - Verbal: a creature with D&D 5e's Silenced status can't speak a spell's verbal component. Any creature, character
 *   or NPC, is checked, and for any spell it casts, since nothing stands in for speech.
 * - Material: a spellcasting focus or a component pouch stands in for a spell's material components that have no cost.
 *   So a character casting such a spell with neither, no focus equipped and no component pouch carried, is warned that
 *   they need the materials themselves. A focus is any equipment, weapon or tool marked Focus, and counts only while
 *   equipped; which kind of focus a class may use isn't checked. Materials with a cost can't be replaced by a focus,
 *   and a spell cast through a feature or an item rather than the character's own spellcasting may not need them, so
 *   neither is warned about. Nor are NPCs.
 *
 * Somatic components aren't checked: D&D 5e doesn't track what a creature holds, and an equipped item needn't be in
 * hand.
 */

import { MODULE_ID, localize } from "./hero-cards.mjs";

/**
 * The spellcasting methods whose spells need their material components. Others, such as innate or at will, often
 * don't.
 */
const SPELLCASTING = new Set(["spell", "pact"]);

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.once("init", registerSettings);
Hooks.on("dnd5e.preUseActivity", onPreUseActivity);

/**
 * Register the setting that turns the warnings on.
 */
function registerSettings() {
  game.settings.register(MODULE_ID, "spellComponentWarnings", {
    name: "STT.Settings.SpellComponentWarnings.Name",
    hint: "STT.Settings.SpellComponentWarnings.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });
}

/* -------------------------------------------- */

/**
 * Warn when a spell is cast without a component it needs.
 * @param {Activity} activity
 */
export function onPreUseActivity(activity) {
  if ( !game.settings.get(MODULE_ID, "spellComponentWarnings") ) return;
  const item = activity?.item;
  if ( item?.type !== "spell" ) return;
  const data = { name: item.actor?.name, spell: item.name };
  if ( cantSpeak(item) ) ui.notifications.warn(localize("STT.SpellComponents.Verbal", data));
  if ( needsFocus(item) && !hasFocus(item.actor) ) ui.notifications.warn(localize("STT.SpellComponents.Material", data));
}

/* -------------------------------------------- */

/**
 * @param {Item5e|void} item
 * @returns {boolean}  Whether it's a spell with a verbal component, cast by a creature that's Silenced.
 */
export function cantSpeak(item) {
  if ( (item?.type !== "spell") || !item.system.properties.has("vocal") ) return false;
  return !!item.actor?.statuses?.has("silenced");
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
