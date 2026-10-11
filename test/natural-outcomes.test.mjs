import { beforeEach, describe, expect, it } from "vitest";
import { actorNames, actorOwners, settingValues } from "./helpers/foundry-shims.mjs";
import { requestMessage, rollMessage } from "./helpers/messages.mjs";
import { getNaturalOutcome, meetsDC } from "../scripts/hero-cards.mjs";
import { wrapD20Roll } from "../scripts/natural-outcomes.mjs";
import { getChallengeState, getPartKind, getResults, scoreTeam } from "../scripts/roll-requests.mjs";

/**
 * Natural 1s and 20s that decide a roll made against a DC: a natural 20 always succeeds and a natural 1 always fails,
 * on each kind of roll whose setting is on.
 */

beforeEach(() => {
  actorNames.clear();
  actorOwners.clear();
  for ( const name of ["A", "B", "C"] ) actorNames.set(name, name);
  game.messages = [];
  game.user = { isGM: true };
  settingValues.set("naturalChecks", true);
  settingValues.set("naturalSaveOutcomes", true);
});

/* -------------------------------------------- */

describe("a natural 1 or 20 against a DC", () => {
  it("succeeds on a natural 20 and fails on a natural 1, whatever the total", () => {
    expect(meetsDC(21, 30, 20, "check")).toBe(true);
    expect(meetsDC(16, 15, 1, "check")).toBe(false);
  });

  it("leaves any other d20 to its total", () => {
    expect(getNaturalOutcome(19, "check")).toBeNull();
    expect(meetsDC(15, 15, 12, "check")).toBe(true);
    expect(meetsDC(14, 15, 12, "check")).toBe(false);
  });

  it("leaves a roll of no kind, or with no d20, to its total", () => {
    expect(meetsDC(21, 30, 20)).toBe(false);
    expect(meetsDC(21, 30, 20, "attack")).toBe(false);
    expect(meetsDC(16, 15, undefined, "check")).toBe(true);
  });

  it("judges every check by its total with the setting off", () => {
    settingValues.set("naturalChecks", false);
    expect(meetsDC(21, 30, 20, "check")).toBe(false);
    expect(meetsDC(16, 15, 1, "check")).toBe(true);
  });

  it("decides a save under its own setting, apart from the one for checks", () => {
    expect(meetsDC(21, 30, 20, "save")).toBe(true);
    expect(meetsDC(16, 15, 1, "save")).toBe(false);
    settingValues.set("naturalSaveOutcomes", false);
    expect(meetsDC(21, 30, 20, "save")).toBe(false);
    expect(meetsDC(16, 15, 1, "save")).toBe(true);
    expect(meetsDC(21, 30, 20, "check")).toBe(true);
    settingValues.set("naturalSaveOutcomes", true);
    settingValues.set("naturalChecks", false);
    expect(meetsDC(21, 30, 20, "save")).toBe(true);
  });
});

/* -------------------------------------------- */

describe("a request's rolls", () => {
  const request = parts => requestMessage({ mode: "standard", actors: ["A", "B"], parts });

  it("judges skill, ability and tool checks, and a plain d20, as checks", () => {
    expect(["skill", "check", "tool", "d20"].map(getPartKind)).toEqual(["check", "check", "check", "check"]);
    expect(["death", "d6", "d100"].map(getPartKind)).toEqual([undefined, undefined, undefined]);
  });

  it("judges a saving throw as a save, and leaves a death save to dnd5e", () => {
    expect(getPartKind("save")).toBe("save");
    game.messages = [rollMessage({ actor: "A", total: 9, natural: 20 }), rollMessage({ actor: "B", total: 17, natural: 1 })];
    const results = getResults(request([{ type: "save", key: "dex", dc: 15 }]));
    expect(results.get("A")[0]).toMatchObject({ success: true, kind: "save" });
    expect(results.get("B")[0]).toMatchObject({ success: false, kind: "save" });
  });

  it("judges a death save by its total", () => {
    game.messages = [rollMessage({ actor: "A", total: 11, natural: 1 })];
    expect(getResults(request([{ type: "death", dc: 10 }])).get("A")[0]).toMatchObject({ success: true, kind: undefined });
  });

  it("judges a save by its total with only the setting for checks on", () => {
    settingValues.set("naturalSaveOutcomes", false);
    game.messages = [rollMessage({ actor: "A", total: 9, natural: 20 })];
    expect(getResults(request([{ type: "save", key: "dex", dc: 15 }])).get("A")[0].success).toBe(false);
  });

  it("passes a natural 20 under the DC and fails a natural 1 over it", () => {
    game.messages = [rollMessage({ actor: "A", total: 19, natural: 20 }), rollMessage({ actor: "B", total: 26, natural: 1 })];
    const results = getResults(request([{ type: "skill", key: "ath", dc: 25 }]));
    expect(results.get("A")[0]).toMatchObject({ success: true, kind: "check" });
    expect(results.get("B")[0]).toMatchObject({ success: false, kind: "check" });
  });

  it("judges the roll an actor chose by that roll's kind and DC", () => {
    game.messages = [rollMessage({ actor: "A", total: 8, natural: 20, choice: 1 })];
    const part = { type: "d6", dc: 30, alternatives: [{ type: "tool", key: "thief", dc: 12 }] };
    expect(getResults(request([part])).get("A")[0]).toMatchObject({ success: true, kind: "check", choice: 1 });
  });

  it("gives a roll without a DC no result, natural or not", () => {
    game.messages = [rollMessage({ actor: "A", total: 19, natural: 20 })];
    expect(getResults(request([{ type: "skill", key: "ath", dc: null }])).get("A")[0].success).toBeNull();
  });

  it("counts a natural 20 as a skill challenge's success", () => {
    game.messages = [
      rollMessage({ actor: "A", total: 5, natural: 20, part: 0 }), rollMessage({ actor: "A", total: 30, natural: 1, part: 1 })
    ];
    const part = { type: "skill", key: "ath", dc: 15 };
    const results = getResults(requestMessage({ mode: "challenge", actors: ["A"], successes: 2, parts: [part, part, part] }));
    expect(getChallengeState(results.get("A"), 2)).toMatchObject({ passed: 1, failed: 1, success: null, next: 2 });
  });

  it("judges by totals alone with the setting off", () => {
    settingValues.set("naturalChecks", false);
    game.messages = [rollMessage({ actor: "A", total: 19, natural: 20 }), rollMessage({ actor: "B", total: 26, natural: 1 })];
    const results = getResults(request([{ type: "skill", key: "ath", dc: 25 }]));
    expect([results.get("A")[0].success, results.get("B")[0].success]).toEqual([false, true]);
  });
});

/* -------------------------------------------- */

describe("a team scored by its successes", () => {
  const entries = rows => rows.map(([uuid, total, natural]) => ({ uuid, total, natural, kind: "check" }));

  it("counts a natural 20 as one of the half that must succeed, and a natural 1 as not", () => {
    expect(scoreTeam(entries([["A", 9, 20], ["B", 8, 6]]), "half", 15)).toMatchObject({ score: 1, success: true });
    expect(scoreTeam(entries([["A", 22, 1], ["B", 8, 6]]), "half", 15)).toMatchObject({ score: 0, success: false });
  });

  it("has a natural 20 help the leader, and a natural 1 hinder them", () => {
    const team = scoreTeam(entries([["A", 20, 5], ["B", 9, 20], ["C", 16, 1]]), "leader", 15);
    expect(team).toMatchObject({ leader: "A", helped: 1, hindered: 1, score: 20 });
    expect([team.notes.get("B"), team.notes.get("C")]).toEqual(["helped", "hindered"]);
  });

  it("counts by totals alone for rolls of no kind", () => {
    const rolls = [{ uuid: "A", total: 9, natural: 20 }, { uuid: "B", total: 8, natural: 6 }];
    expect(scoreTeam(rolls, "half", 15)).toMatchObject({ score: 0, success: false });
  });
});

/* -------------------------------------------- */

describe("the rolls dnd5e judges", () => {
  class BasicRoll {
    constructor(total, natural, options = {}) {
      Object.assign(this, { total, options, _evaluated: true, d20: { results: [{ result: natural, active: true }] } });
    }

    get isSuccess() {
      if ( !this._evaluated ) return undefined;
      return Number.isNumeric(this.options.target) && (this.total >= this.options.target);
    }

    get isFailure() {
      if ( !this._evaluated ) return undefined;
      return Number.isNumeric(this.options.target) && (this.total < this.options.target);
    }
  }

  let D20Roll;
  const outcome = roll => [roll.isSuccess, roll.isFailure];

  beforeEach(() => {
    D20Roll = class extends BasicRoll {};
    CONFIG.Dice.D20Roll = D20Roll;
    wrapD20Roll();
  });

  it("has a check's natural 20 succeed and its natural 1 fail", () => {
    expect(outcome(new D20Roll(12, 20, { target: 25, rollType: "check" }))).toEqual([true, false]);
    expect(outcome(new D20Roll(18, 1, { target: 15, rollType: "check" }))).toEqual([false, true]);
  });

  it("has a save's natural 20 succeed and its natural 1 fail", () => {
    expect(outcome(new D20Roll(12, 20, { target: 25, rollType: "save" }))).toEqual([true, false]);
    expect(outcome(new D20Roll(18, 1, { target: 15, rollType: "save" }))).toEqual([false, true]);
    settingValues.set("naturalSaveOutcomes", false);
    expect(outcome(new D20Roll(12, 20, { target: 25, rollType: "save" }))).toEqual([false, true]);
  });

  it("leaves other naturals, and other kinds of roll, to their totals", () => {
    expect(outcome(new D20Roll(12, 11, { target: 25, rollType: "check" }))).toEqual([false, true]);
    expect(outcome(new D20Roll(12, 20, { target: 25, rollType: "attack" }))).toEqual([false, true]);
    expect(outcome(new D20Roll(12, 20, { target: 25 }))).toEqual([false, true]);
  });

  it("leaves a roll with no target, or not yet rolled, as dnd5e has it", () => {
    expect(outcome(new D20Roll(12, 20, { rollType: "check" }))).toEqual([false, false]);
    const unrolled = Object.assign(new D20Roll(12, 20, { target: 25, rollType: "check" }), { _evaluated: false });
    expect(outcome(unrolled)).toEqual([undefined, undefined]);
  });

  it("follows the setting as it changes", () => {
    const roll = new D20Roll(12, 20, { target: 25, rollType: "check" });
    settingValues.set("naturalChecks", false);
    expect(outcome(roll)).toEqual([false, true]);
  });
});
