import { beforeEach, describe, expect, it } from "vitest";
import { settingValues } from "./helpers/foundry-shims.mjs";
import { MODULE_ID } from "../scripts/hero-cards.mjs";
import { compareNaturals, getInitiativeNatural, onPreUpdateCombatant } from "../scripts/natural-initiative.mjs";

/**
 * @param {string} name
 * @param {number|null} initiative
 * @param {1|20|0} [natural]
 * @param {object} [more]  Anything else the combatant has, such as its group.
 * @returns {object}  A stand-in for a combatant.
 */
function combatant(name, initiative, natural, more = {}) {
  return { name, initiative, flags: natural === undefined ? {} : { [MODULE_ID]: { natural } }, ...more };
}

/**
 * @param {number} total
 * @param {number} d20  What its d20 shows.
 * @returns {object}  A rolled initiative roll.
 */
function d20Roll(total, d20) {
  return Object.assign(new CONFIG.Dice.D20Roll(), {
    _evaluated: true, total, d20: { results: [{ active: true, result: d20 }] }
  });
}

/**
 * Sort as Foundry does: by the naturals, then by initiative, highest first.
 * @param {object[]} combatants
 * @returns {string[]}  Their names, in initiative order.
 */
function order(combatants) {
  const total = c => c.initiative ?? -Infinity;
  return [...combatants].sort((a, b) => compareNaturals(a, b) || (total(b) - total(a))).map(c => c.name);
}

beforeEach(() => settingValues.set("naturalInitiative", true));

describe("Natural 1s and 20s in the initiative order", () => {
  it("puts a natural 20 first and a natural 1 last, whatever their totals", () => {
    const combatants = [
      combatant("high", 24, 0), combatant("one", 9, 1), combatant("twenty", 19, 20), combatant("low", 3)
    ];
    expect(order(combatants)).toEqual(["twenty", "high", "low", "one"]);
  });

  it("orders several of the same natural by their totals", () => {
    const combatants = [
      combatant("slow twenty", 18, 20), combatant("fast twenty", 25, 20), combatant("plain", 30, 0),
      combatant("slow one", -1, 1), combatant("fast one", 6, 1)
    ];
    expect(order(combatants)).toEqual(["fast twenty", "slow twenty", "plain", "fast one", "slow one"]);
  });

  it("keeps combatants yet to roll below a natural 1", () => {
    const combatants = [combatant("waiting", null), combatant("one", 2, 1), combatant("plain", 12, 0)];
    expect(order(combatants)).toEqual(["plain", "one", "waiting"]);
  });

  it("ignores a natural left on a combatant whose initiative was cleared", () => {
    expect(getInitiativeNatural(combatant("reset", null, 20))).toBe(0);
  });

  it("orders by totals alone with the setting off", () => {
    settingValues.set("naturalInitiative", false);
    const combatants = [combatant("high", 24, 0), combatant("one", 9, 1), combatant("twenty", 19, 20)];
    expect(order(combatants)).toEqual(["high", "twenty", "one"]);
    expect(getInitiativeNatural(combatants[2])).toBe(0);
  });
});

describe("Noting a combatant's natural as it is given its initiative", () => {
  it("leaves an update that doesn't change initiative alone", () => {
    const changes = { hidden: true };
    onPreUpdateCombatant(combatant("a", 12, 20), changes);
    expect(changes).toEqual({ hidden: true });
  });

  it("clears the natural of an initiative that was typed in or reset", () => {
    for ( const initiative of [15, null] ) {
      const changes = { initiative };
      onPreUpdateCombatant(combatant("a", 22, 20), changes);
      expect(changes.flags[MODULE_ID].natural).toBe(0);
    }
  });

  it("keeps a natural the update sets itself, and the module's other flags", () => {
    const changes = { initiative: 21, flags: { [MODULE_ID]: { natural: 20 } } };
    onPreUpdateCombatant(combatant("a", 12, 0), changes);
    expect(changes.flags[MODULE_ID].natural).toBe(20);

    const other = { initiative: 8, flags: { [MODULE_ID]: { other: true } } };
    onPreUpdateCombatant(combatant("a", 12, 0), other);
    expect(other.flags[MODULE_ID]).toEqual({ other: true, natural: 0 });
  });

  it("shares a group's natural with a combatant given the group's initiative", () => {
    const group = { getInitiativeGroupingKey: () => "goblins" };
    const leader = combatant("goblin 1", 22, 20, group);
    const other = combatant("orc", 22, 1, { getInitiativeGroupingKey: () => "orcs" });
    const follower = combatant("goblin 2", null, undefined, group);
    follower.parent = { combatants: [other, follower, leader] };

    const changes = { initiative: 22 };
    onPreUpdateCombatant(follower, changes);
    expect(changes.flags[MODULE_ID].natural).toBe(20);

    const apart = { initiative: 14 };
    onPreUpdateCombatant(follower, apart);
    expect(apart.flags[MODULE_ID].natural).toBe(0);
  });
});

describe("Remembering initiative rolls", () => {
  it("notes the natural of the roll a combatant's initiative came from", async () => {
    // The script wraps the combat classes on init, which the test runs by hand.
    class Combat { _sortCombatants(a, b) { return b.initiative - a.initiative; } }
    let next;
    class Combatant { getInitiativeRoll() { return next; } }
    CONFIG.Combat = { documentClass: Combat };
    CONFIG.Combatant = { documentClass: Combatant };
    const { wrapCombat } = await import("../scripts/natural-initiative.mjs");
    wrapCombat();

    const fighter = Object.assign(new Combatant(), { initiative: null, flags: {} });
    // A roll made only to read its formula, then the one that is rolled.
    next = Object.assign(new CONFIG.Dice.D20Roll(), { _evaluated: false });
    fighter.getInitiativeRoll();
    next = d20Roll(23, 20);
    fighter.getInitiativeRoll();
    const changes = { initiative: 23 };
    onPreUpdateCombatant(fighter, changes);
    expect(changes.flags[MODULE_ID].natural).toBe(20);

    // The roll is spent: the same total typed in later has no natural.
    const typed = { initiative: 23 };
    onPreUpdateCombatant(fighter, typed);
    expect(typed.flags[MODULE_ID].natural).toBe(0);

    const sorted = [
      Object.assign(new Combatant(), { name: "high", initiative: 30, flags: {} }),
      Object.assign(new Combatant(), { name: "twenty", initiative: 23, flags: { [MODULE_ID]: { natural: 20 } } })
    ].sort(new Combat()._sortCombatants);
    expect(sorted.map(c => c.name)).toEqual(["twenty", "high"]);
  });
});
