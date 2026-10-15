import { beforeEach, describe, expect, it } from "vitest";
import { settingValues } from "./helpers/foundry-shims.mjs";
import {
  getDescribedShots, getReloadWeapon, onPostRollAttack, onPreRollAttack, spendsOwnUses
} from "../scripts/reload-weapons.mjs";

/**
 * @param {object} [options]
 * @param {number|null} [options.max]  The weapon's Limited Uses, or null for none.
 * @param {number} [options.spent]
 * @param {string[]} [options.properties]
 * @param {object[]} [options.consumption]  The activity's consumption targets.
 * @param {string} [options.description]
 * @returns {object}  A stand-in for an attack activity on a weapon, noting the updates made to the weapon.
 */
function attack({ max = 6, spent = 0, properties = ["rel", "fir"], consumption = [], description = "" } = {}) {
  const updates = [];
  const item = {
    id: "gun", type: "weapon", name: "Pistol", uuid: "Actor.a.Item.gun", isOwner: true, inCompendium: false,
    actor: {}, getFlag: () => undefined, setFlag: async () => {},
    update: async data => updates.push(data),
    system: {
      properties: new Set(properties), description: { value: description },
      uses: { max, spent, value: max ? Math.max(max - spent, 0) : 0 }
    }
  };
  return { item, updates, consumption: { targets: consumption } };
}

beforeEach(() => {
  settingValues.set("reloadWeapons", true);
  // Answer the reload prompt with No.
  foundry.applications.api.DialogV2.confirm = async () => false;
});

describe("Counting a Reload weapon's shots", () => {
  it("spends a shot on each attack rolled", () => {
    const subject = attack({ spent: 2 });
    onPostRollAttack([{}], { subject });
    expect(subject.updates).toEqual([{ "system.uses.spent": 3 }]);
  });

  it("spends nothing on an attack that wasn't rolled", () => {
    const subject = attack();
    onPostRollAttack([], { subject });
    expect(subject.updates).toEqual([]);
  });

  it("leaves an activity that spends the weapon's uses to spend them itself", () => {
    const subject = attack({ consumption: [{ type: "itemUses", target: "" }] });
    expect(spendsOwnUses(subject)).toBe(true);
    onPostRollAttack([{}], { subject });
    expect(subject.updates).toEqual([]);
  });

  it("still spends a shot when the activity spends some other item's uses", () => {
    expect(spendsOwnUses(attack({ consumption: [{ type: "itemUses", target: "other" }] }))).toBe(false);
  });

  it("ignores a weapon that isn't Reload", () => {
    expect(getReloadWeapon(attack({ properties: ["lod"] }))).toBeNull();
  });

  it("does nothing with the setting off", () => {
    settingValues.set("reloadWeapons", false);
    const subject = attack();
    onPostRollAttack([{}], { subject });
    expect(subject.updates).toEqual([]);
  });
});

describe("An empty Reload weapon", () => {
  it("stops the attack", () => {
    expect(onPreRollAttack({ subject: attack({ spent: 6 }) })).toBe(false);
  });

  it("lets an attack with shots left go ahead", () => {
    expect(onPreRollAttack({ subject: attack({ spent: 5 }) })).toBeUndefined();
  });

  it("lets a weapon that doesn't count shots go ahead", () => {
    expect(onPreRollAttack({ subject: attack({ max: null }) })).toBeUndefined();
  });
});

describe("Reading the shots from a weapon's description", () => {
  it("finds Reload's number", () => {
    expect(getDescribedShots(attack({ description: "<p><em>Ammunition, Reload 6</em></p>" }).item)).toBe(6);
    expect(getDescribedShots(attack({ description: "<p>reload (4 shots)</p>" }).item)).toBe(4);
  });

  it("finds nothing when no number is given", () => {
    expect(getDescribedShots(attack({ description: "<p>Firearm</p>" }).item)).toBeNull();
  });
});
