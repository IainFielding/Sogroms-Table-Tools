import { describe, expect, it } from "vitest";
import { MODULE_ID, cardArtHTML } from "../scripts/hero-cards.mjs";
import { canSee, canSpend, isBonusRoll, isValidTarget } from "../scripts/bonus-rolls.mjs";

const gm = { id: "gm", isGM: true };
const bard = { id: "bard", isGM: false };
const fighter = { id: "fighter", isGM: false };

/**
 * @param {object} data
 * @returns {object}  A chat message stand-in, as the bonus roll rules read it.
 */
function message({ type = "base", author = bard, whisper = [], blind = false, flags = {}, rolls = [{}] } = {}) {
  return { type, author, whisper, blind, system: {}, rolls, getFlag: (scope, key) => (scope === MODULE_ID ? flags[key] : undefined) };
}

/* -------------------------------------------- */

describe("Who can spend a bonus roll", () => {
  it("lets the player who rolled it spend it", () => {
    expect(canSpend(message(), bard)).toBe(true);
  });

  it("doesn't let another player spend it, even though they can see it", () => {
    expect(canSee(message(), fighter)).toBe(true);
    expect(canSpend(message(), fighter)).toBe(false);
  });

  it("lets the GM spend anyone's", () => {
    expect(canSpend(message(), gm)).toBe(true);
  });

  it("can't be spent twice, or when it's a check rather than a plain roll", () => {
    expect(canSpend(message({ flags: { bonusUsed: { sign: 1 } } }), bard)).toBe(false);
    expect(canSpend(message({ type: "check" }), bard)).toBe(false);
  });

  it("can be spent from a feature's card holding only its die, as Midi-QOL keeps it, but not one with an attack or damage", () => {
    expect(canSpend(message({ type: "usage", rolls: [new CONFIG.Dice.BasicRoll()] }), bard)).toBe(true);
    expect(canSpend(message({ type: "usage", rolls: [new CONFIG.Dice.D20Roll()] }), bard)).toBe(false);
    expect(canSpend(message({ type: "usage", rolls: [new CONFIG.Dice.BasicRoll(), new CONFIG.Dice.DamageRoll()] }), bard))
      .toBe(false);
  });

  it("can't be spent on a roll made for a roll request", () => {
    expect(canSpend(message({ flags: { requestRoll: { request: "r" } } }), bard)).toBe(false);
  });
});

/* -------------------------------------------- */

describe("What counts as a bonus roll", () => {
  it("is a plain roll, such as a feature's die", () => {
    expect(isBonusRoll(message())).toBe(true);
  });

  it("isn't one already spent, or one made for a roll request", () => {
    expect(isBonusRoll(message({ flags: { bonusUsed: { target: "Aria", sign: 1 } } }))).toBe(false);
    expect(isBonusRoll(message({ flags: { requestRoll: { request: "request" } } }))).toBe(false);
  });

  it("isn't a check, save, attack or damage roll, or a d20 or damage roll on a card of its own", () => {
    expect(isBonusRoll(message({ type: "check" }))).toBe(false);
    expect(isBonusRoll(message({ rolls: [new CONFIG.Dice.D20Roll()] }))).toBe(false);
    expect(isBonusRoll(message({ rolls: [{}, new CONFIG.Dice.DamageRoll()] }))).toBe(false);
  });

  it("isn't a message with no rolls", () => {
    expect(isBonusRoll(message({ rolls: [] }))).toBe(false);
    expect(isBonusRoll(undefined)).toBe(false);
  });
});

/* -------------------------------------------- */

describe("Which rolls a bonus can go on", () => {
  const source = message();

  it("goes on a check, save, attack or damage roll the user can see", () => {
    expect(isValidTarget(message({ type: "save", author: fighter }), source, bard)).toBe(true);
  });

  it("doesn't go on itself, on a plain roll, or on nothing", () => {
    expect(isValidTarget(source, source, bard)).toBe(false);
    expect(isValidTarget(message({ author: fighter }), source, bard)).toBe(false);
    expect(isValidTarget(undefined, source, bard)).toBe(false);
  });

  it("doesn't go on a roll whispered to someone else, or a blind roll", () => {
    expect(isValidTarget(message({ type: "save", author: gm, whisper: ["gm"] }), source, bard)).toBe(false);
    expect(isValidTarget(message({ type: "save", author: fighter, blind: true }), source, bard)).toBe(false);
    expect(isValidTarget(message({ type: "save", author: gm, whisper: ["gm", "bard"] }), source, bard)).toBe(true);
  });
});

/* -------------------------------------------- */

describe("Card art in tooltips", () => {
  it("escapes the art and label, which come from a message's flags", () => {
    const html = cardArtHTML('x" onerror="alert(1)', "<b>Luck</b>");
    expect(html).toBe('<img src="x&quot; onerror=&quot;alert(1)" alt="&lt;b&gt;Luck&lt;/b&gt;">');
  });
});
