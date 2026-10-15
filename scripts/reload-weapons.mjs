/**
 * Reload weapons. A firearm marked Reload fires a number of shots, then takes an action to reload. D&D 5e gives the
 * property no number, so the shots are kept as the weapon's own Limited Uses: Reload 6 is 6 uses, and each attack
 * roll spends one, as an attack with ammunition spends a piece of it.
 *
 * - A Reload weapon with no Limited Uses is offered to be set up after its first attack, with the number from its
 *   description, such as "Reload 6", when there is one. Declined, it isn't offered again.
 * - An attack with no shots left isn't rolled. A dialog offers to reload instead, after which the attack can be rolled.
 * - An attack activity set to spend the weapon's uses already spends one each use, so is left to do so.
 */

import { MODULE_ID, localize, reportError } from "./hero-cards.mjs";

/**
 * Weapons whose set-up has been offered on this client and not yet answered, by UUID.
 * @type {Set<string>}
 */
const offering = new Set();

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.once("init", registerSettings);
Hooks.on("dnd5e.preRollAttackV2", onPreRollAttack);
Hooks.on("dnd5e.postRollAttack", onPostRollAttack);

/**
 * Register the setting that turns shot counting on.
 */
function registerSettings() {
  game.settings.register(MODULE_ID, "reloadWeapons", {
    name: "STT.Settings.ReloadWeapons.Name",
    hint: "STT.Settings.ReloadWeapons.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });
}

/* -------------------------------------------- */

/**
 * Stop an attack with an empty Reload weapon before its dialog opens, and offer to reload it instead.
 * @param {object} config  Roll process configuration.
 * @returns {false|void}  False to stop the roll.
 */
export function onPreRollAttack(config) {
  if ( !game.settings.get(MODULE_ID, "reloadWeapons") ) return;
  const item = getReloadWeapon(config.subject);
  if ( !item?.system.uses?.max || (item.system.uses.value > 0) ) return;
  if ( item.isOwner ) promptReload(item).catch(reportError);
  return false;
}

/* -------------------------------------------- */

/**
 * Spend a shot once an attack has been rolled, or offer to set up a Reload weapon that doesn't count them yet.
 * @param {D20Roll[]} rolls
 * @param {object} data
 * @param {Activity} data.subject
 */
export function onPostRollAttack(rolls, { subject }) {
  if ( !rolls?.length || !game.settings.get(MODULE_ID, "reloadWeapons") ) return;
  const item = getReloadWeapon(subject);
  if ( !item?.isOwner || item.inCompendium ) return;
  if ( !item.system.uses?.max ) {
    offerSetup(item).catch(reportError);
    return;
  }
  if ( spendsOwnUses(subject) ) return;
  item.update({ "system.uses.spent": Math.min(item.system.uses.spent + 1, item.system.uses.max) }).catch(reportError);
}

/* -------------------------------------------- */

/**
 * @param {Activity|void} activity
 * @returns {Item5e|null}  The activity's weapon, when it's an owned weapon marked Reload.
 */
export function getReloadWeapon(activity) {
  const item = activity?.item;
  if ( !item?.actor || (item.type !== "weapon") || !item.system.properties?.has("rel") ) return null;
  return item;
}

/* -------------------------------------------- */

/**
 * @param {Activity} activity
 * @returns {boolean}  Whether the activity is set to spend its own weapon's uses, which D&D 5e does as it's used.
 */
export function spendsOwnUses(activity) {
  return !!activity.consumption?.targets?.some(t => (t.type === "itemUses")
    && (!t.target || (t.target === activity.item.id)));
}

/* -------------------------------------------- */

/**
 * @param {Item5e} item
 * @returns {number|null}  The shots a weapon's description gives, from text such as "Reload 6" or "reload (6 shots)".
 */
export function getDescribedShots(item) {
  const text = item.system.description?.value ?? "";
  const match = text.replace(/<[^>]*>/g, " ").match(/\breload\s*\(?\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

/* -------------------------------------------- */
/*  Dialogs                                     */
/* -------------------------------------------- */

/**
 * Ask whether to reload an empty weapon, and fill it if so.
 * @param {Item5e} item
 */
async function promptReload(item) {
  const reload = await foundry.applications.api.DialogV2.confirm({
    window: { title: item.name, icon: "fa-solid fa-gun" },
    content: `<p>${foundry.utils.escapeHTML(localize("STT.Weapons.Reload.Empty", { name: item.name }))}</p>`,
    yes: { label: "STT.Weapons.Reload.Reload", icon: "fa-solid fa-rotate" },
    rejectClose: false
  });
  if ( !reload ) return;
  await item.update({ "system.uses.spent": 0 });
  ui.notifications.info(localize("STT.Weapons.Reload.Reloaded", { name: item.name, shots: item.system.uses.max }));
}

/* -------------------------------------------- */

/**
 * Offer to count a Reload weapon's shots with its Limited Uses, counting the attack just rolled as the first.
 * @param {Item5e} item
 */
async function offerSetup(item) {
  if ( item.getFlag(MODULE_ID, "reloadOffered") || offering.has(item.uuid) ) return;
  offering.add(item.uuid);
  try {
    const escapeHTML = foundry.utils.escapeHTML;
    const data = await foundry.applications.api.DialogV2.input({
      classes: ["stt-card-dialog"],
      window: { title: item.name, icon: "fa-solid fa-gun" },
      position: { width: 360 },
      content: `
        <p class="stt-card-hint">${escapeHTML(localize("STT.Weapons.Reload.SetupHint", { name: item.name }))}</p>
        <div class="form-group">
          <label>${escapeHTML(localize("STT.Weapons.Reload.Shots"))}</label>
          <div class="form-fields">
            <input type="number" name="shots" value="${getDescribedShots(item) ?? ""}" min="1" step="1" required autofocus>
          </div>
        </div>
      `,
      ok: { label: "STT.Weapons.Reload.Setup", icon: "fa-solid fa-check" },
      rejectClose: false
    });
    const shots = Number(data?.shots);
    if ( !Number.isInteger(shots) || (shots < 1) ) {
      await item.setFlag(MODULE_ID, "reloadOffered", true);
      return;
    }
    await item.update({
      "system.uses.max": String(shots),
      "system.uses.spent": 1,
      [`flags.${MODULE_ID}.reloadOffered`]: true
    });
  } finally {
    offering.delete(item.uuid);
  }
}
