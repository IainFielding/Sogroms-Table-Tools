/**
 * Natural 1s and 20s on initiative. A combatant whose initiative roll shows a natural 20 goes first in the initiative
 * order, above any higher total, and one whose roll shows a natural 1 goes last, below any lower total. Each keeps
 * the initiative it rolled, which still orders several natural 20s, or several natural 1s, among themselves.
 *
 * Foundry rolls initiative and gives the combatant its total without saying which roll it came from. So each
 * combatant's initiative roll is remembered as it is made, and the natural it shows is saved on the combatant in the
 * same update as its initiative. Every client then sorts the tracker by it.
 */

import { MODULE_ID, getNatural, localize } from "./hero-cards.mjs";

/**
 * The initiative rolls made for each combatant on this client that haven't yet been given to it as its initiative.
 * @type {WeakMap<Combatant, Roll[]>}
 */
const rolled = new WeakMap();

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

// On init rather than on setup: Foundry sorts each combat's turns as it loads the world, between the two.
Hooks.once("init", registerSettings);
Hooks.once("init", wrapCombat);
Hooks.on("preUpdateCombatant", onPreUpdateCombatant);
Hooks.on("renderCombatTracker", onRenderCombatTracker);

/**
 * Register the setting. Changing it sorts every combat again.
 */
function registerSettings() {
  game.settings.register(MODULE_ID, "naturalInitiative", {
    name: "STT.Settings.NaturalInitiative.Name",
    hint: "STT.Settings.NaturalInitiative.Hint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    onChange: () => {
      for ( const combat of game.combats ) combat.setupTurns();
      ui.combat?.render();
    }
  });
}

/* -------------------------------------------- */

/**
 * Sort natural 20s first and natural 1s last in the initiative order, and remember each initiative roll as it is made.
 */
export function wrapCombat() {
  const combat = CONFIG.Combat.documentClass.prototype;
  const combatant = CONFIG.Combatant.documentClass.prototype;
  const sort = combat._sortCombatants;
  const getInitiativeRoll = combatant.getInitiativeRoll;
  if ( !sort || !getInitiativeRoll ) {
    console.warn(`${MODULE_ID} | Foundry's combat has changed: natural 1s and 20s won't change the initiative order.`);
    return;
  }
  combat._sortCombatants = function(a, b) {
    return compareNaturals(a, b) || sort.call(this, a, b);
  };
  combatant.getInitiativeRoll = function(...args) {
    const roll = getInitiativeRoll.apply(this, args);
    // dnd5e also asks for a roll to read its formula, without rolling it, so those not rolled are dropped.
    rolled.set(this, [...(rolled.get(this) ?? []).filter(r => r._evaluated), roll]);
    return roll;
  };
}

/* -------------------------------------------- */
/*  Initiative Order                            */
/* -------------------------------------------- */

/**
 * @param {Combatant} combatant
 * @returns {1|20|0}  The natural 1 or 20 the combatant's initiative roll shows, while the setting is on.
 */
export function getInitiativeNatural(combatant) {
  if ( !Number.isNumeric(combatant.initiative) || !game.settings.get(MODULE_ID, "naturalInitiative") ) return 0;
  const natural = combatant.flags?.[MODULE_ID]?.natural;
  return [1, 20].includes(natural) ? natural : 0;
}

/**
 * Order two combatants by their naturals alone: a natural 20 before everyone else, and a natural 1 after everyone who
 * has rolled. Combatants yet to roll stay last.
 * @param {Combatant} a
 * @param {Combatant} b
 * @returns {number}  Negative if `a` goes first, positive if `b` does, and 0 if their naturals don't decide it.
 */
export function compareNaturals(a, b) {
  const place = c => {
    if ( !Number.isNumeric(c.initiative) ) return 3;
    return { 20: 0, 0: 1, 1: 2 }[getInitiativeNatural(c)];
  };
  return place(a) - place(b);
}

/* -------------------------------------------- */
/*  Noting Naturals                             */
/* -------------------------------------------- */

/**
 * @param {Roll} [roll]
 * @returns {1|20|0}  The natural 1 or 20 an initiative roll shows.
 */
function getRollNatural(roll) {
  const natural = roll ? getNatural(roll) : null;
  return [1, 20].includes(natural) ? natural : 0;
}

/**
 * Save a combatant's natural alongside its new initiative. An update that sets it already, as one made after a Hero
 * Card or a bonus changed the roll, is left alone. An initiative that was typed in, or cleared, has no natural.
 * @param {Combatant} combatant
 * @param {object} changes  Changed in place.
 */
export function onPreUpdateCombatant(combatant, changes) {
  if ( !("initiative" in changes) ) return;
  const own = changes.flags?.[MODULE_ID];
  if ( own && ("natural" in own) ) return;
  changes.flags ??= {};
  changes.flags[MODULE_ID] = { ...own, natural: findNatural(combatant, changes.initiative) };
}

/**
 * The natural behind an initiative a combatant is being given: that of the roll just made for it or, for one of a
 * group that rolls together, that of the combatant in its group whose initiative it shares.
 * @param {Combatant} combatant
 * @param {number|null} initiative
 * @returns {1|20|0}
 */
function findNatural(combatant, initiative) {
  const rolls = rolled.get(combatant) ?? [];
  rolled.delete(combatant);
  if ( !Number.isNumeric(initiative) ) return 0;
  const roll = rolls.findLast(r => r._evaluated && (r.total === initiative));
  if ( roll ) return getRollNatural(roll);
  const group = combatant.getInitiativeGroupingKey?.() ?? null;
  if ( group === null ) return 0;
  const leader = combatant.parent?.combatants.find(c => (c !== combatant) && (c.initiative === initiative)
    && (c.getInitiativeGroupingKey?.() === group));
  const natural = leader?.flags?.[MODULE_ID]?.natural;
  return [1, 20].includes(natural) ? natural : 0;
}

/* -------------------------------------------- */
/*  Combat Tracker                              */
/* -------------------------------------------- */

/**
 * Mark the initiative of each combatant a natural has moved, so a low total at the top of the order explains itself.
 * @param {CombatTracker} app
 * @param {HTMLElement} html
 */
function onRenderCombatTracker(app, html) {
  for ( const row of html.querySelectorAll?.(".combatant[data-combatant-id]") ?? [] ) {
    const combatant = app.viewed?.combatants.get(row.dataset.combatantId);
    const natural = combatant ? getInitiativeNatural(combatant) : 0;
    const initiative = row.querySelector(".token-initiative");
    if ( !natural || !initiative ) continue;
    initiative.classList.add(`stt-natural-${natural}`);
    initiative.dataset.tooltipText = localize(`STT.Initiative.Natural${natural}`);
  }
}
