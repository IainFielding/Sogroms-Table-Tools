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
 * - Flanking, the Dungeon Master's Guide's optional rule, off unless turned on: a creature and an ally both beside an
 *   enemy, on opposite sides or corners of its space, have advantage on melee attacks against it. Square grids only.
 *
 * Heavy and the Lance each add a source of disadvantage, and flanking one of advantage, to those D&D 5e gathers for the
 * attack, so they're resolved by its rules alongside the rest: advantage and disadvantage cancel out, an effect that
 * says the roll can't have one stops it, and one that forces a mode wins. What that resolves to is the roll's starting
 * mode, so the roll dialog shows it and the player can still change it there.
 *
 * Midi-QOL applies the Heavy rule itself, and lets effects excuse a creature from it, so Heavy is left to Midi-QOL
 * while it's active. Midi-QOL has its own optional flanking too, so flanking is left to it while that's turned on.
 *
 * All of this is worked out once, as an attack is rolled: nothing watches tokens move.
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
 * Statuses that keep an ally from flanking, as a creature that can't act. D&D 5e gives Paralyzed, Petrified, Stunned and
 * Unconscious the Incapacitated status too.
 */
const CANT_FLANK = ["incapacitated", "dead"];

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
  // Flanking is an optional rule, so it starts off.
  for ( const [key, lang, on] of [["heavyWeapons", "HeavyWeapons", true], ["loadingWeapons", "LoadingWeapons", true],
    ["lanceDisadvantage", "LanceDisadvantage", true], ["flanking", "Flanking", false]] ) {
    game.settings.register(MODULE_ID, key, {
      name: `STT.Settings.${lang}.Name`,
      hint: `STT.Settings.${lang}.Hint`,
      scope: "world",
      config: false,
      type: Boolean,
      default: on
    });
  }
}

/* -------------------------------------------- */

/**
 * Before an attack's dialog opens, add the advantage or disadvantage a property or flanking calls for to the attack's,
 * and warn of a second shot from a Loading weapon in the same turn.
 * @param {object} config  Roll process configuration.
 */
export function onPreRollAttack(config) {
  const activity = config.subject;
  let disadvantages = 0;
  let advantages = 0;
  if ( game.settings.get(MODULE_ID, "heavyWeapons") && !game.modules.get("midi-qol")?.active
    && hasHeavyDisadvantage(activity) ) disadvantages++;
  // The target is only looked for when a rule that needs it could apply.
  const lance = game.settings.get(MODULE_ID, "lanceDisadvantage") && isLance(activity);
  const flanking = game.settings.get(MODULE_ID, "flanking") && !midiFlanks() && isMelee(activity, config.attackMode);
  if ( lance || flanking ) {
    const { attacker, target } = getAttackerAndTarget(activity);
    if ( lance && hasLanceDisadvantage(activity, attacker ? getTokenDistance(attacker, target) : null) ) disadvantages++;
    if ( flanking && attacker && isFlanking(attacker, target, target.parent.tokens) ) advantages++;
  }
  if ( disadvantages || advantages ) {
    addRollModes(config, { advantages: { count: advantages }, disadvantages: { count: disadvantages } });
  }

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
  return isLance(activity) && Number.isFinite(distance) && (distance <= LANCE_RANGE);
}

/* -------------------------------------------- */

/**
 * @param {Activity|void} activity
 * @returns {boolean}  Whether it's an attack with the 2014 Lance, marked Special.
 */
function isLance(activity) {
  const { item, actor } = getWeapon(activity, "spc");
  return !!actor && (item.system.type?.baseItem === "lance");
}

/* -------------------------------------------- */
/*  Flanking                                    */
/* -------------------------------------------- */

/**
 * @param {Activity|void} activity
 * @param {string} [attackMode]
 * @returns {boolean}  Whether it's a melee attack, with a weapon or a spell. A thrown weapon makes a ranged attack.
 */
function isMelee(activity, attackMode) {
  return !!activity?.getActionType?.(attackMode)?.startsWith("m");
}

/* -------------------------------------------- */

/**
 * @returns {boolean}  Whether Midi-QOL's own optional flanking is turned on.
 */
function midiFlanks() {
  if ( !game.modules.get("midi-qol")?.active ) return false;
  const rule = globalThis.MidiQOL?.checkRule?.("checkFlanking");
  return !!rule && (rule !== "off");
}

/* -------------------------------------------- */

/**
 * Whether an attacker flanks its target: both it and an ally are beside the target, on opposite sides or corners of
 * the target's space. Allies are tokens of the attacker's disposition, friendly or hostile, that can act.
 * @param {TokenDocument} attacker
 * @param {TokenDocument} target
 * @param {Iterable<TokenDocument>} tokens  The tokens on the scene.
 * @returns {boolean}
 */
export function isFlanking(attacker, target, tokens) {
  const { FRIENDLY, HOSTILE } = CONST.TOKEN_DISPOSITIONS;
  if ( !attacker.parent?.grid?.isSquare || ![FRIENDLY, HOSTILE].includes(attacker.disposition) ) return false;
  if ( target.disposition === attacker.disposition ) return false;
  const targetSpaces = getSpaces(target);
  const attackerSpaces = getSpaces(attacker);
  if ( !areAdjacent(attackerSpaces, targetSpaces) ) return false;
  for ( const ally of tokens ) {
    if ( (ally === attacker) || (ally === target) || (ally.disposition !== attacker.disposition) ) continue;
    if ( CANT_FLANK.some(s => ally.actor?.statuses?.has(s)) ) continue;
    // Most tokens are nowhere near, and are ruled out by where they stand before any line is drawn.
    const allySpaces = getSpaces(ally);
    if ( !areAdjacent(allySpaces, targetSpaces) ) continue;
    if ( flanks(attackerSpaces, allySpaces, targetSpaces) ) return true;
  }
  return false;
}

/* -------------------------------------------- */

/**
 * Whether a line between the centres of a space of each flanker passes through opposite sides or opposite corners of
 * the target's space, as the Dungeon Master's Guide draws it. A creature larger than one space flanks if any of its
 * spaces does.
 * @param {GridOffset2D[]} attackerSpaces
 * @param {GridOffset2D[]} allySpaces
 * @param {GridOffset2D[]} targetSpaces
 * @returns {boolean}
 */
export function flanks(attackerSpaces, allySpaces, targetSpaces) {
  // The target's space, its edges half a space out from the centres of its outer squares; x is the column, y the row.
  const box = {
    left: Math.min(...targetSpaces.map(s => s.j)) - 0.5, right: Math.max(...targetSpaces.map(s => s.j)) + 0.5,
    top: Math.min(...targetSpaces.map(s => s.i)) - 0.5, bottom: Math.max(...targetSpaces.map(s => s.i)) + 0.5
  };
  for ( const a of attackerSpaces ) {
    for ( const b of allySpaces ) {
      const crossed = crossedEdges({ x: a.j, y: a.i }, { x: b.j, y: b.i }, box);
      if ( !crossed ) continue;
      const { entry, exit } = crossed;
      const opposite = (one, other) => (entry.has(one) && exit.has(other)) || (entry.has(other) && exit.has(one));
      if ( opposite("left", "right") || opposite("top", "bottom") ) return true;
    }
  }
  return false;
}

/* -------------------------------------------- */

/**
 * The edges of a box a line enters and leaves it through, clipping the line to the box (Liang-Barsky). A line through a
 * corner enters or leaves through both of its edges.
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 * @param {{left: number, right: number, top: number, bottom: number}} box
 * @returns {{ entry: Set<string>, exit: Set<string> }|null}  Null if the line misses the box.
 */
function crossedEdges(from, to, box) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const edges = [
    ["left", -dx, from.x - box.left], ["right", dx, box.right - from.x],
    ["top", -dy, from.y - box.top], ["bottom", dy, box.bottom - from.y]
  ];
  let enter = 0;
  let leave = 1;
  const crossings = [];
  for ( const [edge, p, q] of edges ) {
    if ( p === 0 ) {
      // Running alongside this edge, outside the box.
      if ( q < 0 ) return null;
      continue;
    }
    const t = q / p;
    crossings.push({ edge, t, entering: p < 0 });
    if ( p < 0 ) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
  }
  if ( enter > leave ) return null;
  const at = (t, entering) => new Set(crossings.filter(c => (c.entering === entering) && (Math.abs(c.t - t) < 1e-9))
    .map(c => c.edge));
  return { entry: at(enter, true), exit: at(leave, false) };
}

/* -------------------------------------------- */

/**
 * @param {GridOffset2D[]} a
 * @param {GridOffset2D[]} b
 * @returns {boolean}  Whether a space of one is beside a space of the other, diagonals included.
 */
function areAdjacent(a, b) {
  return a.some(s => b.some(t => Math.max(Math.abs(s.i - t.i), Math.abs(s.j - t.j)) === 1));
}

/* -------------------------------------------- */
/*  Tokens                                      */
/* -------------------------------------------- */

/**
 * @param {Activity|void} activity
 * @returns {{ attacker?: TokenDocument, target?: TokenDocument }}  The attacker's token and the user's one target, when
 *   there's exactly one and both are on the same scene.
 */
function getAttackerAndTarget(activity) {
  if ( game.user.targets?.size !== 1 ) return {};
  const target = game.user.targets.first().document;
  const attacker = activity?.actor?.token ?? activity?.actor?.getActiveTokens(false, true)[0];
  if ( !attacker || (attacker.parent !== target?.parent) ) return {};
  return { attacker, target };
}

/* -------------------------------------------- */

/**
 * The square grid spaces a token covers, worked out from where it stands and its size. Foundry's own
 * getOccupiedGridSpaceOffsets also considers walls, building a polygon for each call on a scene with levels, which an
 * attack roll needn't wait for. A token smaller than a space covers the one its centre is in.
 * @param {TokenDocument} token
 * @returns {GridOffset2D[]}
 */
export function getSpaces(token) {
  const size = token.parent.grid.size;
  const width = Math.max(1, Math.round(token.width));
  const height = Math.max(1, Math.round(token.height));
  const column = Math.round(((token.x + (token.width * size / 2)) / size) - (width / 2));
  const row = Math.round(((token.y + (token.height * size / 2)) / size) - (height / 2));
  const spaces = [];
  for ( let i = 0; i < height; i++ ) {
    for ( let j = 0; j < width; j++ ) spaces.push({ i: row + i, j: column + j });
  }
  return spaces;
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
  // Square spaces are worked out from where each token stands; hexagonal ones are left to Foundry.
  const spaces = token => (grid.isSquare ? getSpaces(token) : token.getOccupiedGridSpaceOffsets());
  let nearest = Infinity;
  for ( const from of spaces(a) ) {
    for ( const to of spaces(b) ) {
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
