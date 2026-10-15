import { beforeEach, describe, expect, it } from "vitest";
import { settingValues } from "./helpers/foundry-shims.mjs";
import { hasFocus, needsFocus } from "../scripts/spell-focus.mjs";

/**
 * @param {object} [options]
 * @param {string[]} [options.properties]  The spell's components.
 * @param {number} [options.cost]          What its materials cost.
 * @param {string} [options.method]
 * @param {string} [options.actorType]
 * @param {object[]} [options.items]       The actor's other items.
 * @param {string} [options.cachedFor]     The item the spell is cast through, if any.
 * @returns {object}  A stand-in for a spell on an actor.
 */
function spell({
  properties = ["vocal", "somatic", "material"], cost = 0, method = "spell", actorType = "character", items = [],
  cachedFor
} = {}) {
  const actor = { type: actorType, name: "Merric", items };
  return {
    type: "spell", name: "Shield", actor, getFlag: (scope, key) => (key === "cachedFor" ? cachedFor : undefined),
    system: { method, properties: new Set(properties), materials: { cost } }
  };
}

/**
 * @param {string} type
 * @param {object} [more]
 * @returns {object}  A stand-in for an item an actor carries.
 */
const carried = (type, { focus = false, equipped = false, identifier = "" } = {}) => ({
  type, identifier, system: { equipped, properties: new Set(focus ? ["foc"] : []) }
});

beforeEach(() => settingValues.set("spellFocusWarning", true));

describe("Spells that need a focus", () => {
  it("counts a character's own spell with materials that cost nothing", () => {
    expect(needsFocus(spell())).toBe(true);
    expect(needsFocus(spell({ method: "pact" }))).toBe(true);
  });

  it("ignores a spell with no materials, or materials with a cost", () => {
    expect(needsFocus(spell({ properties: ["vocal", "somatic"] }))).toBe(false);
    expect(needsFocus(spell({ cost: 300 }))).toBe(false);
  });

  it("ignores innate spells, spells cast through an item, and NPCs", () => {
    expect(needsFocus(spell({ method: "innate" }))).toBe(false);
    expect(needsFocus(spell({ cachedFor: "Item.staff" }))).toBe(false);
    expect(needsFocus(spell({ actorType: "npc" }))).toBe(false);
  });

  it("ignores items that aren't spells", () => {
    expect(needsFocus({ type: "weapon", actor: { type: "character" } })).toBe(false);
  });
});

describe("Having a focus", () => {
  it("counts an equipped focus, of any item type", () => {
    for ( const type of ["equipment", "weapon", "tool"] ) {
      expect(hasFocus({ items: [carried(type, { focus: true, equipped: true })] })).toBe(true);
    }
  });

  it("doesn't count a focus that isn't equipped", () => {
    expect(hasFocus({ items: [carried("equipment", { focus: true })] })).toBe(false);
  });

  it("counts a component pouch carried, equipped or not", () => {
    expect(hasFocus({ items: [carried("container", { identifier: "component-pouch" })] })).toBe(true);
  });

  it("doesn't count other gear", () => {
    expect(hasFocus({ items: [carried("container", { identifier: "pouch" }), carried("equipment", { equipped: true })] }))
      .toBe(false);
  });
});
