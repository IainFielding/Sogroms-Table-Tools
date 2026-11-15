import { describe, expect, it } from "vitest";
import { getHeroicEffect } from "../scripts/hero-cards.mjs";

/**
 * @param {object} [overrides]
 * @returns {object}  A straight d20 attack by a character with Heroic Inspiration, under the 2024 rules.
 */
function roll(overrides = {}) {
  return { inspired: true, kind: "attack", d20: true, natural: 8, hasAdvantage: false, legacy: false, ...overrides };
}

describe("Spending Heroic Inspiration on a roll", () => {
  it("rerolls a d20 test under the 2024 rules", () => {
    for ( const kind of ["attack", "check", "save", "initiative"] ) expect(getHeroicEffect(roll({ kind }))).toBe("reroll");
  });

  it("gives advantage under the 2014 rules", () => {
    expect(getHeroicEffect(roll({ legacy: true }))).toBe("advantage");
  });

  it("needs the character to have it", () => {
    expect(getHeroicEffect(roll({ inspired: false }))).toBeNull();
  });

  it("isn't spent on damage, Divine Intervention, or a roll with no d20", () => {
    expect(getHeroicEffect(roll({ kind: "damage" }))).toBeNull();
    expect(getHeroicEffect(roll({ kind: "divine" }))).toBeNull();
    expect(getHeroicEffect(roll({ d20: false }))).toBeNull();
  });

  it("can reroll a natural 1, unlike Lucky", () => {
    expect(getHeroicEffect(roll({ natural: 1 }))).toBe("reroll");
  });

  it("isn't offered to reroll a natural 20, which nothing could better", () => {
    expect(getHeroicEffect(roll({ natural: 20 }))).toBeNull();
  });

  it("isn't offered for advantage on a roll that already has it", () => {
    expect(getHeroicEffect(roll({ legacy: true, hasAdvantage: true }))).toBeNull();
    // Rerolling under the 2024 rules rerolls both dice, so advantage doesn't stop it.
    expect(getHeroicEffect(roll({ hasAdvantage: true }))).toBe("reroll");
  });
});
