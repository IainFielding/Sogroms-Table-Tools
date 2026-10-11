/**
 * Bloodied Effect Tint
 *
 * Extends the built-in D&D 5e BLOODIED active effect as it is created
 * so tokens gain a red tint and red token ring accents.
 */

import { MODULE_ID } from "./hero-cards.mjs";

Hooks.once("init", registerSettings);
Hooks.on("preCreateActiveEffect", onPreCreateActiveEffect);

/**
 * Register the setting that turns the tint on.
 */
function registerSettings() {
  game.settings.register(MODULE_ID, "bloodiedTint", {
    name: "STT.Settings.BloodiedTint.Name",
    hint: "STT.Settings.BloodiedTint.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });
}

/* -------------------------------------------- */

/**
 * Add the tint and ring colour to a Bloodied effect as it is created.
 * @param {ActiveEffect5e} effect
 */
function onPreCreateActiveEffect(effect) {
  if ( !game.settings.get(MODULE_ID, "bloodiedTint") ) return;
  if ( effect.id !== effect.constructor.ID.BLOODIED ) return;

  const changes = effect.toObject().system.changes;
  changes.push(
    { key: "token.texture.tint", type: "override", value: "#f19393" },
    { key: "token.ring.colors.background", type: "override", value: "#ff0000" }
  );

  effect.updateSource({ "system.changes": changes });
}
