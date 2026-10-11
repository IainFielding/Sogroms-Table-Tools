/**
 * End-to-end tests for natural 1s and 20s that decide a roll: a natural 20 on a check or a saving throw made against a
 * DC always succeeds and a natural 1 always fails, on request cards and on the rolls dnd5e judges itself, and in a
 * Roll-Off a natural 20 wins outright and a natural 1 loses, whatever the totals.
 *
 * Every ability is 10, so a check's total is the die forced for it: a natural 20 is set against DC 25 and a natural 1
 * against DC 1, which only the natural can decide. For the Roll-Offs the Goblin is given a Strength of 30, so its
 * Athletics check adds 10.
 */

import { MODULE_ID } from "./config.mjs";
import {
  assertEqual, clickRoll, forceDice, postRequest, readCard, rollButton, rollModifiers, test, waitFor, waitForCard, waitForRoll
} from "./lib/harness.mjs";

const d20 = n => [n, 20];
const SETTINGS = ["naturalChecks", "naturalSaveOutcomes", "naturalRollOff"];

/**
 * Check a setting is registered as the other natural 1 and 20 settings are: a world setting, on by default, shown in
 * the module's own menu.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {string} key
 */
async function assertSetting(gm, key) {
  const setting = await gm.eval(({ moduleId, key }) => {
    const s = game.settings.settings.get(`${moduleId}.${key}`);
    return { config: s?.config, scope: s?.scope, default: s?.default };
  }, { moduleId: MODULE_ID, key });
  assertEqual(setting, { config: false, scope: "world", default: true }, `the ${key} setting`);
}

/**
 * Turn one of the settings on or off, and wait for it to reach the player.
 * @param {TestContext} ctx
 * @param {string} key
 * @param {boolean} value
 */
async function setSetting({ gm, player }, key, value) {
  await gm.eval(({ moduleId, key, value }) => game.settings.set(moduleId, key, value), { moduleId: MODULE_ID, key, value });
  await waitFor(player, ({ moduleId, key, value }) => game.settings.get(moduleId, key) === value,
    { moduleId: MODULE_ID, key, value }, `${key} to reach the player`);
}

/**
 * Turn the settings back on, and give the Goblin back its Strength of 10.
 * @param {import("./lib/session.mjs").Session} gm
 */
async function cleanUp(gm) {
  await gm.eval(async ({ moduleId, keys }) => {
    for ( const key of keys ) {
      if ( !game.settings.get(moduleId, key) ) await game.settings.set(moduleId, key, true);
    }
    const goblin = game.actors.getName("Goblin");
    if ( goblin.system.abilities.str.value !== 10 ) await goblin.update({ "system.abilities.str.value": 10 });
  }, { moduleId: MODULE_ID, keys: SETTINGS });
}

/**
 * Ask Aria and Borin for a roll, Aria rolling a natural 20 against DC 25 and Borin a natural 1 against DC 1, and check
 * the naturals decide it on the GM's card until the setting is turned off.
 * @param {TestContext} ctx
 * @param {object} roll     The roll asked for, without its DC.
 * @param {string} setting  The setting that lets a natural decide this kind of roll.
 */
async function assertNaturalsDecide(ctx, roll, setting) {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "standard", parts: [{ ...roll, dc: 25, alternatives: [{ ...roll, dc: 1 }] }], actors: [ids.aria, ids.borin]
  });
  await forceDice(player, [d20(20), d20(1)]);
  for ( const [name, choice] of [["Aria", 0], ["Borin", 1]] ) {
    // Each is offered the roll at either DC, and the click that picks one rolls it straight away.
    await rollButton(player, id, name).click();
    const button = player.page.locator(`.stt-choice-dialog button[data-action="choice${choice}"]`);
    await button.waitFor({ timeout: 10_000 });
    await button.click({ modifiers: await rollModifiers(player, id, name, true) });
    await player.page.locator(".stt-choice-dialog").waitFor({ state: "detached", timeout: 10_000 });
    await waitForCard(gm, id, c => c.rows.find(r => r.name === name).results.length === 1, `${name}'s roll`);
  }
  const outcomes = card => card.rows.map(r => [r.name, r.results[0].text, r.classes[0]]);
  assertEqual(outcomes(await readCard(gm, id)), [["Aria", "20", "success"], ["Borin", "1", "failure"]],
    "the GM's rows: a natural 20 under DC 25 and a natural 1 at DC 1");

  await setSetting(ctx, setting, false);
  const card = await waitForCard(gm, id, c => c.rows[0].classes[0] === "failure", "the card scored again by totals");
  assertEqual(outcomes(card), [["Aria", "20", "failure"], ["Borin", "1", "success"]], "the GM's rows with the setting off");
}

/**
 * Make a roll against a DC as the player, for Aria, without a request, and read how dnd5e judges it for the GM.
 * @param {TestContext} ctx
 * @param {"rollSkill"|"rollSavingThrow"} method
 * @param {object} config   What to roll.
 * @param {number} natural
 * @param {number} dc
 * @returns {Promise<{ kind: string, success: boolean, failure: boolean }>}
 */
async function rollAgainstDC({ gm, player }, method, config, natural, dc) {
  await forceDice(player, [d20(natural)]);
  const id = await player.eval(async ({ method, config, dc }) => {
    const [roll] = await game.actors.getName("Aria")[method]({ ...config, target: dc }, { configure: false });
    return roll.parent.id;
  }, { method, config, dc });
  await waitFor(gm, id => !!game.messages.get(id), id, "the roll to reach the GM");
  return gm.eval(id => {
    const roll = game.messages.get(id).rolls[0];
    return { kind: roll.options.rollType, success: roll.isSuccess, failure: roll.isFailure };
  }, id);
}

test("natural outcomes: on a request card, a check's natural 20 passes and its natural 1 fails, whatever the DC", async (ctx) => {
  try {
    await assertSetting(ctx.gm, "naturalChecks");
    await assertNaturalsDecide(ctx, { type: "skill", key: "ath" }, "naturalChecks");
  } finally {
    await cleanUp(ctx.gm);
  }
});

test("natural outcomes: on a request card, a save's natural 20 passes and its natural 1 fails, whatever the DC", async (ctx) => {
  try {
    await assertSetting(ctx.gm, "naturalSaveOutcomes");
    await assertNaturalsDecide(ctx, { type: "save", key: "dex" }, "naturalSaveOutcomes");
  } finally {
    await cleanUp(ctx.gm);
  }
});

test("natural outcomes: dnd5e judges a check or a save it rolls against a DC by its natural 1 or 20", async (ctx) => {
  try {
    const check = (natural, dc) => rollAgainstDC(ctx, "rollSkill", { skill: "ath" }, natural, dc);
    const save = (natural, dc) => rollAgainstDC(ctx, "rollSavingThrow", { ability: "dex" }, natural, dc);
    assertEqual(await check(20, 25), { kind: "check", success: true, failure: false }, "a check's natural 20 under DC 25");
    assertEqual(await check(1, 1), { kind: "check", success: false, failure: true }, "a check's natural 1 at DC 1");
    assertEqual(await check(12, 15), { kind: "check", success: false, failure: true }, "a check's 12 under DC 15");
    assertEqual(await save(20, 25), { kind: "save", success: true, failure: false }, "a save's natural 20 under DC 25");
    assertEqual(await save(1, 1), { kind: "save", success: false, failure: true }, "a save's natural 1 at DC 1");

    // Each kind of roll follows its own setting.
    await setSetting(ctx, "naturalChecks", false);
    assertEqual(await check(20, 25), { kind: "check", success: false, failure: true }, "a check's natural 20, checks off");
    assertEqual(await save(20, 25), { kind: "save", success: true, failure: false }, "a save's natural 20, checks off");
    await setSetting(ctx, "naturalSaveOutcomes", false);
    assertEqual(await save(1, 1), { kind: "save", success: true, failure: false }, "a save's natural 1, saves off");
  } finally {
    await cleanUp(ctx.gm);
  }
});

test("natural outcomes: in a Roll-Off, a natural 20 beats a higher total and a natural 1 loses to a lower one", async (ctx) => {
  const { gm, player, ids } = ctx;
  /**
   * Set Aria's plain d20 against the Goblin's Athletics check, which adds 10.
   * @param {number} aria    Aria's d20.
   * @param {number} goblin  The Goblin's d20.
   * @returns {Promise<string>}  The request's ID.
   */
  const rollOff = async (aria, goblin) => {
    const id = await postRequest(ctx, {
      mode: "rolloff", parts: [{ type: "d20", key: null, dc: null }, { type: "skill", key: "ath", dc: null }],
      sides: [[ids.aria], [ids.goblin]], actors: [ids.aria, ids.goblin]
    });
    await forceDice(player, [d20(aria)]);
    await clickRoll(player, id, "Aria", { fastForward: true });
    await waitForRoll(gm, id, ids.aria, 0);
    await forceDice(gm, [d20(goblin)]);
    await clickRoll(gm, id, "Goblin", { fastForward: true });
    const roll = await waitForRoll(gm, id, ids.goblin, 1);
    assertEqual(roll.total, goblin + 10, "the Goblin's Athletics total");
    return id;
  };
  // The GM's summary ends with the button that shows the Goblin's roll to players.
  const read = card => [card.summary.replace(/ Show NPC roll$/, ""), card.sides.map(s => s.classes[0])];

  try {
    await assertSetting(gm, "naturalRollOff");
    await gm.eval(() => game.actors.getName("Goblin").update({ "system.abilities.str.value": 30 }));

    const won = await rollOff(20, 15);
    let card = await waitForCard(gm, won, c => c.summary?.includes("wins"), "the natural 20's Roll-Off");
    assertEqual(read(card), ["Aria 20 · Goblin 25 Aria wins on a natural 20", ["success", "failure"]], "a natural 20 against 25");

    const lost = await rollOff(5, 1);
    card = await waitForCard(gm, lost, c => c.summary?.includes("wins"), "the natural 1's Roll-Off");
    assertEqual(read(card), ["Aria 5 · Goblin 11 Aria wins: Goblin rolled a natural 1", ["success", "failure"]],
      "a 5 against a natural 1 totalling 11");

    await setSetting(ctx, "naturalRollOff", false);
    for ( const [id, summary] of [[won, "Aria 20 · Goblin 25 Goblin wins"], [lost, "Aria 5 · Goblin 11 Goblin wins"]] ) {
      card = await waitForCard(gm, id, c => c.summary?.includes("Goblin wins"), "the Roll-Off decided again by totals");
      assertEqual(read(card), [summary, ["failure", "success"]], "with the setting off");
    }
  } finally {
    await cleanUp(gm);
  }
});
