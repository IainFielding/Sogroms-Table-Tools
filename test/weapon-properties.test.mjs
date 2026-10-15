import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { settingValues } from "./helpers/foundry-shims.mjs";
import {
  addRollModes, getTokenDistance, hasHeavyDisadvantage, hasLanceDisadvantage, ignoresLoading, isReloading,
  onPostRollAttack, onPreRollAttack
} from "../scripts/weapon-properties.mjs";

/**
 * D&D 5e's rules for combining sources of advantage and disadvantage (AdvantageModeField.combineFields), over the
 * attacker's own sources, which a stand-in actor keeps as `system.modes`.
 * @param {object} model
 * @param {string[]} keyPaths
 * @param {object} options
 * @returns {{ advantage: boolean, disadvantage: boolean }}
 */
function combineFields(model, keyPaths, { rules, ...counts }) {
  combined.push({ keyPaths, rules });
  const own = model.modes ?? {};
  const override = counts.override ?? own.override ?? null;
  const advantages = (own.advantages ?? 0) + (counts.advantages?.count ?? 0);
  const disadvantages = (own.disadvantages ?? 0) + (counts.disadvantages?.count ?? 0);
  return {
    advantage: (((advantages > 0) && (override === null)) || (override === 1)) && !own.noAdvantage,
    disadvantage: (((disadvantages > 0) && (override === null)) || (override === -1)) && !own.noDisadvantage
  };
}

/** What each call to combineFields was asked to combine. */
const combined = [];

/**
 * @param {object} [options]
 * @param {string[]} [options.properties]
 * @param {"melee"|"ranged"} [options.attackType]
 * @param {string} [options.baseItem]
 * @param {string} [options.type]  The item's type.
 * @param {number} [options.str]
 * @param {number} [options.dex]
 * @param {string} [options.size]
 * @param {string[]} [options.feats]  The identifiers of the actor's feats.
 * @returns {object}  A stand-in for an attack activity on a weapon.
 */
function attack({
  properties = ["hvy"], attackType = "melee", baseItem = "greatsword", type = "weapon", str = 10, dex = 10,
  size = "med", feats = [], modes = {}
} = {}) {
  const actor = {
    system: { abilities: { str: { value: str }, dex: { value: dex } }, traits: { size }, modes },
    identifiedItems: { get: (id, { type }) => ((type === "feat") && feats.includes(id) ? new Set([{}]) : undefined) }
  };
  const item = {
    type, actor, name: "Weapon", uuid: `Item.${Math.random()}`,
    system: { attackType, type: { baseItem }, properties: new Set(properties) }
  };
  return { item, actor, getActionType: () => "mwak", getRollData: () => ({}) };
}

/**
 * @param {object} subject
 * @returns {object}  The roll config onPreRollAttack changes.
 */
function rollWith(subject, options = {}) {
  const config = { subject, ability: "str", rolls: [{ options: { ...options } }] };
  onPreRollAttack(config);
  return config;
}

const rules = dnd5e.settings;

beforeEach(() => {
  for ( const key of ["heavyWeapons", "loadingWeapons", "lanceDisadvantage"] ) settingValues.set(key, true);
  dnd5e.settings = { rulesVersion: "modern" };
  dnd5e.dataModels = { shared: { D20RollModificationField: { combineFields } } };
  combined.length = 0;
});

afterEach(() => {
  dnd5e.settings = rules;
  delete dnd5e.dataModels;
  game.modules.delete("midi-qol");
});

describe("Heavy weapons under the 2024 rules", () => {
  it("gives a melee weapon disadvantage under 13 Strength, and not at 13", () => {
    expect(hasHeavyDisadvantage(attack({ str: 12 }))).toBe(true);
    expect(hasHeavyDisadvantage(attack({ str: 13 }))).toBe(false);
  });

  it("judges a ranged weapon by Dexterity", () => {
    expect(hasHeavyDisadvantage(attack({ attackType: "ranged", str: 18, dex: 12 }))).toBe(true);
    expect(hasHeavyDisadvantage(attack({ attackType: "ranged", str: 8, dex: 14 }))).toBe(false);
  });

  it("ignores size", () => {
    expect(hasHeavyDisadvantage(attack({ str: 16, size: "sm" }))).toBe(false);
  });
});

describe("Heavy weapons under the 2014 rules", () => {
  beforeEach(() => dnd5e.settings = { rulesVersion: "legacy" });

  it("gives Small and Tiny creatures disadvantage, whatever their scores", () => {
    expect(hasHeavyDisadvantage(attack({ str: 18, size: "sm" }))).toBe(true);
    expect(hasHeavyDisadvantage(attack({ str: 18, size: "tiny" }))).toBe(true);
  });

  it("leaves larger creatures alone, whatever their scores", () => {
    expect(hasHeavyDisadvantage(attack({ str: 6, size: "med" }))).toBe(false);
  });
});

describe("Which attacks count as Heavy", () => {
  it("ignores a weapon that isn't Heavy", () => {
    expect(hasHeavyDisadvantage(attack({ properties: [], str: 6 }))).toBe(false);
  });

  it("ignores an attack from an item that isn't a weapon", () => {
    expect(hasHeavyDisadvantage(attack({ type: "spell", str: 6 }))).toBe(false);
  });

  it("ignores an attack with no actor", () => {
    expect(hasHeavyDisadvantage({ item: { type: "weapon", system: { properties: new Set(["hvy"]) } } })).toBe(false);
  });
});

describe("Loading weapons", () => {
  const crossbow = (feats = []) => attack({ properties: ["lod"], baseItem: "lightcrossbow", feats });

  // Round 1, the first turn, of a combat everyone is in.
  beforeEach(() => game.combat = { id: "c", started: true, round: 1, turn: 0, getCombatantsByActor: () => [{}] });
  afterEach(() => game.combat = undefined);

  it("warns of a second attack in the same combat turn, and not in the next", () => {
    const subject = crossbow();
    expect(isReloading(subject, "c.1.0")).toBe(false);
    onPostRollAttack([{}], { subject });
    expect(isReloading(subject, "c.1.0")).toBe(true);
    expect(isReloading(subject, "c.1.1")).toBe(false);
  });

  it("ignores attacks out of combat", () => {
    game.combat = undefined;
    const subject = crossbow();
    onPostRollAttack([{}], { subject });
    expect(isReloading(subject, null)).toBe(false);
  });

  it("lets Crossbow Expert ignore Loading on a crossbow, and not on another weapon", () => {
    const expert = crossbow(["crossbow-expert"]);
    expect(ignoresLoading(expert.actor, expert.item)).toBe(true);
    const blowgun = attack({ properties: ["lod"], baseItem: "blowgun", feats: ["crossbow-expert"] });
    expect(ignoresLoading(blowgun.actor, blowgun.item)).toBe(false);
  });

  it("ignores a weapon that isn't Loading", () => {
    const subject = attack({ properties: [] });
    onPostRollAttack([{}], { subject });
    expect(isReloading(subject, "c.1.0")).toBe(false);
  });
});

describe("The 2014 Lance", () => {
  const lance = (properties = ["rch", "spc"]) => attack({ properties, baseItem: "lance" });

  it("has disadvantage against a target within 5 feet", () => {
    expect(hasLanceDisadvantage(lance(), 5)).toBe(true);
    expect(hasLanceDisadvantage(lance(), 10)).toBe(false);
  });

  it("does nothing without a single target to measure to", () => {
    expect(hasLanceDisadvantage(lance(), null)).toBe(false);
  });

  it("leaves the 2024 Lance, which isn't marked Special, alone", () => {
    expect(hasLanceDisadvantage(lance(["hvy", "rch", "two"]), 5)).toBe(false);
  });

  it("leaves another Special weapon alone", () => {
    expect(hasLanceDisadvantage(attack({ properties: ["spc"], baseItem: "net" }), 5)).toBe(false);
  });
});

describe("Measuring between tokens", () => {
  /**
   * @param {boolean} isGridless
   * @returns {object}  A square grid of 5-foot spaces, measured as a 5e diagonal of 5 feet.
   */
  function grid(isGridless) {
    return {
      isGridless, distance: 5,
      getCenterPoint: ({ i, j }) => ({ x: j, y: i }),
      measurePath: ([a, b]) => ({ distance: Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * 5 })
    };
  }

  /**
   * @param {object} sceneGrid
   * @param {[number, number][]} spaces  The [row, column] of each space it occupies.
   * @param {object} [more]              Its centre and size, for a gridless scene.
   * @returns {object}  A stand-in for a token document.
   */
  const token = (sceneGrid, spaces, more = {}) => ({
    parent: { grid: sceneGrid }, getOccupiedGridSpaceOffsets: () => spaces.map(([i, j]) => ({ i, j })), ...more
  });

  it("counts adjacent spaces, diagonals too, as 5 feet", () => {
    const g = grid(false);
    expect(getTokenDistance(token(g, [[0, 0]]), token(g, [[1, 1]]))).toBe(5);
    expect(getTokenDistance(token(g, [[0, 0]]), token(g, [[0, 2]]))).toBe(10);
  });

  it("measures from the nearest space of a large token", () => {
    const g = grid(false);
    const large = token(g, [[0, 1], [0, 2], [1, 1], [1, 2]]);
    expect(getTokenDistance(token(g, [[0, 0]]), large)).toBe(5);
  });

  it("measures edge to edge on a gridless scene", () => {
    const g = grid(true);
    const at = x => token(g, [], { width: 1, height: 1, getCenterPoint: () => ({ x, y: 0 }) });
    expect(getTokenDistance(at(0), at(1))).toBe(5);
    expect(getTokenDistance(at(0), at(2))).toBe(10);
  });
});

describe("Starting the roll at disadvantage", () => {
  it("marks each roll for disadvantage", () => {
    expect(rollWith(attack({ str: 8 })).rolls[0].options.disadvantage).toBe(true);
  });

  it("leaves a roll the wielder can handle alone", () => {
    expect(rollWith(attack({ str: 16 })).rolls[0].options.disadvantage).toBeUndefined();
  });

  it("does nothing with the setting off", () => {
    settingValues.set("heavyWeapons", false);
    expect(rollWith(attack({ str: 8 })).rolls[0].options.disadvantage).toBeUndefined();
  });

  it("leaves Heavy to Midi-QOL while it's active", () => {
    game.modules.set("midi-qol", { id: "midi-qol", active: true });
    expect(rollWith(attack({ str: 8 })).rolls[0].options.disadvantage).toBeUndefined();
    game.modules.set("midi-qol", { id: "midi-qol", active: false });
    expect(rollWith(attack({ str: 8 })).rolls[0].options.disadvantage).toBe(true);
  });
});

describe("Adding to the attack's own roll modes", () => {
  it("combines with the sources D&D 5e gathers for the attack's ability, all attacks and this kind of attack", () => {
    const subject = attack({ str: 8 });
    rollWith(subject);
    expect(combined).toHaveLength(1);
    expect(combined[0].keyPaths).toEqual(["abilities.str.attack.roll", "rolls.attack", "rolls.attack.mwak"]);
    expect(combined[0].rules).toMatchObject({ category: "attack", actor: subject.actor, item: subject.item });
  });

  it("is cancelled out by a source of advantage, as D&D 5e resolves both", () => {
    const options = rollWith(attack({ str: 8, modes: { advantages: 1 } })).rolls[0].options;
    expect(options).toMatchObject({ advantage: true, disadvantage: true });
  });

  it("is stopped by an effect that says the attack can't have disadvantage", () => {
    expect(rollWith(attack({ str: 8, modes: { noDisadvantage: true } })).rolls[0].options.disadvantage).toBe(false);
  });

  it("gives way to an effect that forces advantage", () => {
    const options = rollWith(attack({ str: 8, modes: { override: 1 } })).rolls[0].options;
    expect(options).toMatchObject({ advantage: true, disadvantage: false });
  });

  it("keeps the advantage and disadvantage the attack already had", () => {
    const config = { subject: attack(), ability: "str", rolls: [{ options: { advantage: true, disadvantage: true } }] };
    addRollModes(config, { disadvantages: { count: 0 } });
    expect(config.rolls[0].options).toMatchObject({ advantage: true, disadvantage: true });
  });

  it("asks nothing of D&D 5e when no property applies", () => {
    rollWith(attack({ str: 16 }));
    expect(combined).toHaveLength(0);
  });
});
