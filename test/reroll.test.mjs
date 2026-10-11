import { afterEach, describe, expect, it } from "vitest";
import { describeD20s, rerollD20 } from "../scripts/hero-cards.mjs";

/**
 * The d20s the next reroll shows, in order.
 * @type {number[]}
 */
let fresh = [];

// Enough of Foundry's Roll for a reroll: "3d20" rolls the next three of `fresh`.
globalThis.Roll = class {
  constructor(formula) {
    const number = Number(formula.split("d")[0]);
    this.dice = [{ results: fresh.splice(0, number).map(result => ({ result, active: true })) }];
  }

  async evaluate() {
    return this;
  }
};

afterEach(() => {
  fresh = [];
});

/**
 * @param {number[]} values  The d20s rolled, of which the highest is kept with advantage, the lowest with
 *   disadvantage, and otherwise the only one.
 * @param {object} [options]
 * @param {"adv"|"adv2"|"dis"} [options.modifier]  How dnd5e rolled them.
 * @returns {object}  A d20 roll stand-in, as rerollD20 reads and rewrites it. Its total is its active d20s.
 */
function d20Roll(values, { modifier } = {}) {
  const kept = values.indexOf(modifier === "dis" ? Math.min(...values) : Math.max(...values));
  const results = values.map((result, i) => ({ result, active: i === kept, discarded: i !== kept }));
  return {
    d20: { results, modifiers: modifier ? [modifier] : [] },
    hasAdvantage: !!modifier?.startsWith("adv"),
    hasDisadvantage: modifier === "dis",
    resetFormula() {},
    _evaluateTotal() {
      return this.d20.results.filter(r => r.active).reduce((total, r) => total + r.result, 0);
    }
  };
}

describe("Rerolling a d20", () => {
  it("rerolls the one d20 of a straight roll", async () => {
    const roll = d20Roll([5]);
    fresh = [13];
    expect(await rerollD20(roll)).toEqual([[5], [13]]);
    expect(roll._total).toBe(13);
  });

  it("rerolls both d20s with advantage, keeping the higher", async () => {
    const roll = d20Roll([4, 15], { modifier: "adv" });
    fresh = [9, 2];
    expect(await rerollD20(roll)).toEqual([[4, 15], [9, 2]]);
    expect(roll._total).toBe(9);
  });

  it("rerolls both d20s with disadvantage, keeping the lower", async () => {
    const roll = d20Roll([4, 15], { modifier: "dis" });
    fresh = [9, 2];
    expect(await rerollD20(roll)).toEqual([[4, 15], [9, 2]]);
    expect(roll._total).toBe(2);
  });

  it("rerolls all three d20s of Elven Accuracy, so the first no longer counts", async () => {
    const roll = d20Roll([18, 6, 11], { modifier: "adv2" });
    fresh = [3, 12, 7];
    expect(await rerollD20(roll)).toEqual([[18, 6, 11], [3, 12, 7]]);
    expect(roll.d20.results.filter(r => r.active).map(r => r.result)).toEqual([12]);
    expect(roll._total).toBe(12);
  });

  it("rerolls only the d20s still in play on a second reroll", async () => {
    const roll = d20Roll([4, 15], { modifier: "adv" });
    fresh = [9, 2, 20, 1];
    await rerollD20(roll);
    expect(await rerollD20(roll)).toEqual([[9, 2], [20, 1]]);
    expect(roll._total).toBe(20);
  });
});

describe("Naming the d20s rerolled", () => {
  it("counts them", () => {
    expect(describeD20s([13])).toBe("the d20");
    expect(describeD20s([9, 2])).toBe("both d20s");
    expect(describeD20s([3, 12, 7])).toBe("all 3 d20s");
  });
});
