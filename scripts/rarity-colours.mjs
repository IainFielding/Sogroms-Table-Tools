/**
 * Item Rarity Colours
 *
 * Adds a CSS class to each item row on actor sheets based on the item's
 * rarity, tinting the row by rarity. The colour scheme follows
 * the World of Warcraft convention for instant visual recognition:
 *
 *   common → pale cream   |  uncommon → green
 *   rare   → blue         |  veryrare → purple
 *   legendary → orange    |  artifact → light gold
 *
 * The actual colour values are defined in styles/world-scripts.css via
 * classes like `.rarity-color-uncommon`, `.rarity-color-rare`, etc.
 *
 * The class is the item's rarity key in lowercase, so dnd5e's "veryRare"
 * becomes `rarity-color-veryrare`.
 */

import { MODULE_ID } from "./hero-cards.mjs";
import { renderActorSheets } from "./fade-unprepared.mjs";

Hooks.once("init", registerSettings);
Hooks.on("renderBaseActorSheet", onRenderActorSheet);

/**
 * Register the setting that turns the colours on.
 */
function registerSettings() {
  game.settings.register(MODULE_ID, "rarityColours", {
    name: "STT.Settings.RarityColours.Name",
    hint: "STT.Settings.RarityColours.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    onChange: renderActorSheets
  });
}

/* -------------------------------------------- */

/**
 * Mark each item row on an actor sheet with its item's rarity.
 * @param {ApplicationV2} app
 * @param {HTMLElement} html
 */
function onRenderActorSheet(app, html) {
  if ( !game.settings.get(MODULE_ID, "rarityColours") ) return;

  // dnd5e's sheets list items in .item-list, and some of its parts still in .items-list.
  const items = html.querySelectorAll(".items-list .item, .item-list .item");
  for ( const itemElement of items ) {
    const id = itemElement.dataset.itemId;
    if ( !id ) continue;
    // Read from the item's own data: its roll data would rebuild the actor's for every row.
    const rarity = app.document.items.get(id)?.system.rarity;
    if ( typeof rarity === "string" && rarity ) itemElement.classList.add(`rarity-color-${rarity.toLowerCase()}`);
  }
}
