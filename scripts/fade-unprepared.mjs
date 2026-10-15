/**
 * Fade Unprepared Spells
 *
 * Fades spells on actor sheets that can be prepared but aren't, so the prepared ones stand out.
 * The fade itself is in styles/world-scripts.css.
 */

import { MODULE_ID } from "./hero-cards.mjs";

Hooks.once("init", registerSettings);
Hooks.on("renderBaseActorSheet", onRenderActorSheet);

/**
 * Register the setting that turns the fade on.
 */
function registerSettings() {
  game.settings.register(MODULE_ID, "fadeUnprepared", {
    name: "STT.Settings.FadeUnprepared.Name",
    hint: "STT.Settings.FadeUnprepared.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    onChange: renderActorSheets
  });
}

/* -------------------------------------------- */

/**
 * Re-render every open actor sheet, so a change to a sheet setting shows at once.
 */
export function renderActorSheets() {
  for ( const app of foundry.applications.instances.values() ) {
    if ( app.document instanceof Actor ) app.render();
  }
}

/* -------------------------------------------- */

/**
 * Mark each unprepared spell on an actor sheet.
 * @param {ApplicationV2} app
 * @param {HTMLElement} html
 */
function onRenderActorSheet(app, html) {
  if ( !game.settings.get(MODULE_ID, "fadeUnprepared") ) return;

  // dnd5e's sheets list items in .item-list, and some of its parts still in .items-list.
  const items = html.querySelectorAll(".items-list .item, .item-list .item");
  for ( const itemElement of items ) {
    const id = itemElement.dataset.itemId;
    if ( !id ) continue;
    const item = app.document.items.get(id);
    if ( !item || item.type !== "spell" ) continue;

    // Spells granted by an item, such as a Staff of Power, can't be prepared.
    if ( item.getFlag("dnd5e", "cachedFor") ) continue;
    // Nor can those listed under a method that isn't prepared, such as at will or innate. The method is on an ancestor
    // of the row, or on the header just before its list.
    const sectionEl = itemElement.closest("[data-method]")
      ?? itemElement.closest("ol")?.previousElementSibling;
    const sectionMethod = sectionEl?.dataset?.method;
    if ( sectionMethod && (sectionMethod !== "spell") && (sectionMethod !== "pact") ) continue;

    // Prepared is 0 for unprepared, 1 for prepared and 2 for always prepared. Cantrips are never prepared.
    const method = item.system?.method;
    if ( (item.system?.prepared === 0) && ((method === "spell") || (method === "pact")) && (item.system.level > 0) ) {
      itemElement.classList.add("preparation-unprepared");
    }
  }
}
