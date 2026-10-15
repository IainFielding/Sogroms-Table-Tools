/**
 * Weapon properties D&D 5e marks on a weapon but applies nothing for. Each has its own setting.
 *
 * - Heavy: an attack starts at disadvantage when its wielder can't handle the weapon, by the rules D&D 5e is set to
 *   use. Under the 2024 rules, that's a melee weapon wielded with a Strength score under 13, or a ranged weapon with a
 *   Dexterity score under 13. Under the 2014 rules, it's any Heavy weapon wielded by a Small or Tiny creature.
 * - Loading: only one piece of ammunition can be fired per action, bonus action or reaction. The module can't tell
 *   which of those an attack is made with, so a second attack with the weapon in the same combat turn is warned
 *   about, not stopped. Crossbow Expert ignores Loading on crossbows.
 * - Lance: the 2014 Lance, marked Special, attacks at disadvantage against a target within 5 feet. The 2024 Lance has
 *   no such rule, and isn't marked Special.
 *
 * Heavy and the Lance each add a source of disadvantage to those D&D 5e gathers for the attack, so they're resolved by
 * its rules alongside the rest: an effect that grants advantage cancels it out, one that says the roll can't have
 * disadvantage stops it, and one that forces a mode wins. What that resolves to is the roll's starting mode, so the
 * roll dialog shows it and the player can still change it there.
 *
 * Midi-QOL applies the Heavy rule itself, and lets effects excuse a creature from it, so Heavy is left to Midi-QOL
 * while it's active.
 */

import { MODULE_ID, localize } from "./hero-cards.mjs";

/**
 * The ability score a creature needs in each attack type of weapon, under the 2024 rules.
 * @type {Record<string, string>}
 */
const ABILITY_FOR = { melee: "str", ranged: "dex" };

/**
 * The lowest score that handles a Heavy weapon, under the 2024 rules.
 */
const MINIMUM_SCORE = 13;

/**
 * Creature sizes too small for a Heavy weapon, under the 2014 rules.
 */
const SMALL_SIZES = new Set(["tiny", "sm"]);

/**
 * The base weapons Crossbow Expert counts as crossbows.
 */
const CROSSBOWS = new Set(["handcrossbow", "heavycrossbow", "lightcrossbow"]);

/**
 * How near a target puts a 2014 Lance at disadvantage, in feet.
 */
const LANCE_RANGE = 5;

/**
 * The combat turn each Loading weapon on this client last attacked in, by the weapon's UUID.
 * @type {Map<string, string>}
 */
const lastFired = new Map();

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.once("init", registerSettings);
Hooks.on("dnd5e.preRollAttackV2", onPreRollAttack);
Hooks.on("dnd5e.postRollAttack", onPostRollAttack);

/**
 * Register a setting for each property's rule.
 */
function registerSettings() {
  for ( const [key, lang] of [["heavyWeapons", "HeavyWeapons"], ["loadingWeapons", "LoadingWeapons"],
    ["lanceDisadvantage", "LanceDisadvantage"]] ) {
    game.settings.register(MODULE_ID, key, {
      name: `STT.Settings.${lang}.Name`,
      hint: `STT.Settings.${lang}.Hint`,
      scope: "world",
      config: false,
      type: Boolean,
      default: true
    });
  }
}

/* -------------------------------------------- */

/**
 * Before an attack's dialog opens, add the disadvantage a property calls for to the attack's, and warn of a second shot
 * from a Loading weapon in the same turn.
 * @param {object} config  Roll process configuration.
 */
export function onPreRollAttack(config) {
  const activity = config.subject;
  let disadvantages = 0;
  if ( game.settings.get(MODULE_ID, "heavyWeapons") && !game.modules.get("midi-qol")?.active
    && hasHeavyDisadvantage(activity) ) disadvantages++;
  if ( game.settings.get(MODULE_ID, "lanceDisadvantage")
    && hasLanceDisadvantage(activity, getTargetDistance(activity)) ) disadvantages++;
  if ( disadvantages ) addRollModes(config, { disadvantages: { count: disadvantages } });

  if ( game.settings.get(MODULE_ID, "loadingWeapons") && isReloading(activity, getTurnKey(activity?.actor)) ) {
    ui.notifications.warn(localize("STT.Weapons.LoadingWarning", { name: activity.item.name }));
  }
}

/* -------------------------------------------- */

/**
 * Add sources of advantage or disadvantage to an attack, resolved with those D&D 5e gathers for it from the attacker's
 * roll modes and effects, as it gathers them: for the ability, for all attacks, and for this kind of attack.
 * @param {object} config                      Roll process configuration, its rolls changed in place.
 * @param {Partial<AdvantageModeData>} counts  The sources to add, such as `{ disadvantages: { count: 1 } }`.
 */
export function addRollModes(config, counts) {
  const activity = config.subject;
  const actor = activity.actor;
  const { ability, attackMode } = config;
  const { advantage, disadvantage } = dnd5e.dataModels.shared.D20RollModificationField.combineFields(actor.system, [
    `abilities.${ability}.attack.roll`, "rolls.attack", `rolls.attack.${activity.getActionType(attackMode)}`
  ], {
    rules: { category: "attack", actor, item: activity.item, rollData: activity.getRollData({ roll: { ability, attackMode } }) },
    ...counts
  });
  // D&D 5e has already set the attack's own advantage and disadvantage, as may another module; neither is taken away.
  for ( const roll of config.rolls ?? [] ) {
    roll.options ??= {};
    roll.options.advantage ||= advantage;
    roll.options.disadvantage ||= disadvantage;
  }
}

/* -------------------------------------------- */

/**
 * Note the combat turn a Loading weapon fired in, once its attack has been rolled.
 * @param {D20Roll[]} rolls
 * @param {object} data
 * @param {Activity} data.subject
 */
export function onPostRollAttack(rolls, { subject }) {
  if ( !rolls?.length || !subject?.item?.system.properties?.has("lod") ) return;
  const key = getTurnKey(subject.actor);
  if ( key ) lastFired.set(subject.item.uuid, key);
}

/* -------------------------------------------- */
/*  Heavy                                       */
/* -------------------------------------------- */

/**
 * @param {Activity|void} activity  The attack activity rolling.
 * @returns {boolean}  Whether its wielder has disadvantage for the weapon being Heavy.
 */
export function hasHeavyDisadvantage(activity) {
  const { item, actor } = getWeapon(activity, "hvy");
  if ( !actor ) return false;

  if ( dnd5e.settings.rulesVersion === "legacy" ) return SMALL_SIZES.has(actor.system.traits?.size);

  const ability = ABILITY_FOR[item.system.attackType];
  const score = actor.system.abilities?.[ability]?.value;
  return Number.isNumeric(score) && (Number(score) < MINIMUM_SCORE);
}

/* -------------------------------------------- */
/*  Loading                                     */
/* -------------------------------------------- */

/**
 * @param {Activity|void} activity  The attack activity rolling.
 * @param {string|null} turn        The combat turn it's rolling in, from getTurnKey.
 * @returns {boolean}  Whether it fires a Loading weapon that has already fired this turn.
 */
export function isReloading(activity, turn) {
  const { item, actor } = getWeapon(activity, "lod");
  if ( !actor || !turn || ignoresLoading(actor, item) ) return false;
  return lastFired.get(item.uuid) === turn;
}

/* -------------------------------------------- */

/**
 * @param {Actor5e} actor
 * @param {Item5e} item  A Loading weapon.
 * @returns {boolean}  Whether Crossbow Expert lets the actor ignore its Loading.
 */
export function ignoresLoading(actor, item) {
  if ( !CROSSBOWS.has(item.system.type?.baseItem) ) return false;
  return !!actor.identifiedItems?.get("crossbow-expert", { type: "feat" })?.size;
}

/* -------------------------------------------- */

/**
 * @param {Actor5e|void} actor
 * @returns {string|null}  The combat turn now being taken, when the actor is fighting in the active combat.
 */
export function getTurnKey(actor) {
  const combat = game.combat;
  if ( !actor || !combat?.started || !combat.getCombatantsByActor?.(actor)?.length ) return null;
  return `${combat.id}.${combat.round}.${combat.turn}`;
}

/* -------------------------------------------- */
/*  Lance                                       */
/* -------------------------------------------- */

/**
 * @param {Activity|void} activity  The attack activity rolling.
 * @param {number|null} distance    How far away its one target is, in feet.
 * @returns {boolean}  Whether it's a 2014 Lance attacking a target within 5 feet.
 */
export function hasLanceDisadvantage(activity, distance) {
  const { item, actor } = getWeapon(activity, "spc");
  if ( !actor || (item.system.type?.baseItem !== "lance") ) return false;
  return Number.isFinite(distance) && (distance <= LANCE_RANGE);
}

/* -------------------------------------------- */

/**
 * @param {Activity|void} activity
 * @returns {number|null}  How far the user's one target is from the attacker's token, if both are on the scene.
 */
function getTargetDistance(activity) {
  if ( game.user.targets?.size !== 1 ) return null;
  const target = game.user.targets.first().document;
  const attacker = activity?.actor?.token ?? activity?.actor?.getActiveTokens(false, true)[0];
  if ( !attacker || (attacker.parent !== target?.parent) ) return null;
  return getTokenDistance(attacker, target);
}

/* -------------------------------------------- */

/**
 * The distance between two tokens, from the nearest grid spaces they each occupy, or edge to edge on a gridless scene.
 * @param {TokenDocument} a
 * @param {TokenDocument} b
 * @returns {number}  In the scene's grid units.
 */
export function getTokenDistance(a, b) {
  const grid = a.parent.grid;
  if ( grid.isGridless ) {
    const between = grid.measurePath([a.getCenterPoint(), b.getCenterPoint()]).distance;
    const radii = ((Math.max(a.width, a.height) + Math.max(b.width, b.height)) / 2) * grid.distance;
    return Math.max(0, between - radii + grid.distance);
  }
  let nearest = Infinity;
  for ( const from of a.getOccupiedGridSpaceOffsets() ) {
    for ( const to of b.getOccupiedGridSpaceOffsets() ) {
      const { distance } = grid.measurePath([grid.getCenterPoint(from), grid.getCenterPoint(to)]);
      nearest = Math.min(nearest, distance);
    }
  }
  return nearest;
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * @param {Activity|void} activity  The attack activity rolling.
 * @param {string} property         The weapon property it must have.
 * @returns {{ item?: Item5e, actor?: Actor5e }}  Its weapon and wielder, when it's a weapon with that property.
 */
function getWeapon(activity, property) {
  const item = activity?.item;
  const actor = activity?.actor ?? item?.actor;
  if ( !actor || (item?.type !== "weapon") || !item.system.properties?.has(property) ) return {};
  return { item, actor };
}
