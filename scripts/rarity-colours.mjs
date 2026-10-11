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
 * Rarity is resolved from the item's roll data first (covers most
 * cases including compendium items), falling back to the raw
 * system.rarity field. The value is normalised to lowercase with
 * whitespace stripped so "Very Rare" becomes the class
 * `rarity-color-veryrare`.
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

  // Query all item rows on the sheet (legacy and V2 selectors).
  const items = html.querySelectorAll(".items-list .item, .item-list .item");
  for ( const itemElement of items ) {
    // Extract the item ID from the element's data attribute.
    const id = itemElement.dataset.itemId;
    if ( !id ) continue;

    const item = app.document.items.get(id);
    if ( !item ) continue;

    // Resolve rarity: prefer roll data (handles overrides / enriched data), fall back to the raw system field.
    let rarity = item.getRollData()?.item?.rarity || item.system?.rarity || undefined;

    // Normalise: strip whitespace and lowercase so e.g. "Very Rare" becomes "veryrare", matching the CSS class names.
    rarity = rarity ? rarity.replaceAll(/\s/g, "").toLowerCase() : undefined;

    // Apply the rarity class (e.g. "rarity-color-rare") to the row element so the CSS rules can colour it.
    if ( rarity ) itemElement.classList.add(`rarity-color-${rarity}`);
  }
}
