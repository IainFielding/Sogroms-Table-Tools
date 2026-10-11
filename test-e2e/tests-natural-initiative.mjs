/**
 * End-to-end tests for natural 1s and 20s on initiative: a natural 20 goes first in the initiative order and a natural
 * 1 last, whatever their totals, for the GM and the players alike.
 *
 * Initiative is rolled through Foundry's own combat, by the player for their character and by the GM for the NPC, with
 * the d20s forced. Borin's initiative is typed in, as a GM would, to put a total above the natural 20 or below the
 * natural 1.
 */

import { MODULE_ID } from "./config.mjs";
import { assertEqual, forceDice, test, waitFor } from "./lib/harness.mjs";

/**
 * Start a combat with Aria, Borin and the Goblin in it, as the GM.
 * @param {import("./lib/session.mjs").Session} gm
 */
function startCombat(gm) {
  return gm.eval(async () => {
    const combat = await Combat.create({ active: true });
    await combat.createEmbeddedDocuments("Combatant",
      ["Aria", "Borin", "Goblin"].map(name => ({ actorId: game.actors.getName(name).id })));
    await combat.activate();
  });
}

/**
 * Roll initiative for one combatant on a user's client, with the d20 forced.
 * @param {import("./lib/session.mjs").Session} session
 * @param {string} name
 * @param {number} d20
 */
async function rollInitiative(session, name, d20) {
  await forceDice(session, [[d20, 20]]);
  await session.eval(name => game.combat.rollInitiative([game.combat.combatants.getName(name).id]), name);
}

/**
 * Type in a combatant's initiative, as the GM.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {string} name
 * @param {number} initiative
 */
function setInitiative(gm, name, initiative) {
  return gm.eval(({ name, initiative }) => game.combat.combatants.getName(name).update({ initiative }),
    { name, initiative });
}

/**
 * Wait for a user's initiative order to read as expected.
 * @param {import("./lib/session.mjs").Session} session
 * @param {string[]} expected  The combatants' names, first to last.
 * @param {string} what
 */
async function expectOrder(session, expected, what) {
  const order = await waitFor(session, expected => {
    const names = game.combat?.turns.map(c => c.name) ?? [];
    return names.join() === expected.join() ? names : null;
  }, expected, `${what}: ${expected.join(", ")}`).catch(async () => session.eval(() => game.combat?.turns.map(c => c.name)));
  assertEqual(order, expected, what);
}

test("natural initiative: a natural 20 goes first and a natural 1 last, whatever their totals", async ({ gm, player }) => {
  const setting = await gm.eval(moduleId => {
    const s = game.settings.settings.get(`${moduleId}.naturalInitiative`);
    return { config: s?.config, scope: s?.scope, default: s?.default };
  }, MODULE_ID);
  assertEqual(setting, { config: false, scope: "world", default: true }, "the setting");

  await startCombat(gm);
  await waitFor(player, () => game.combat?.combatants.size === 3, null, "the combat to reach the player");
  await rollInitiative(player, "Aria", 20);
  await rollInitiative(gm, "Goblin", 1);
  await setInitiative(gm, "Borin", 40);
  for ( const [session, who] of [[gm, "the GM"], [player, "the player"]] ) {
    await expectOrder(session, ["Aria", "Borin", "Goblin"], `the order for ${who}, with a total above the natural 20`);
  }
  await setInitiative(gm, "Borin", -10);
  for ( const [session, who] of [[gm, "the GM"], [player, "the player"]] ) {
    await expectOrder(session, ["Aria", "Borin", "Goblin"], `the order for ${who}, with a total below the natural 1`);
  }

  // Each keeps the initiative it rolled, marked in the tracker.
  const marked = await gm.eval(async () => {
    await ui.combat.render({ force: true });
    const mark = name => {
      const row = ui.combat.element.querySelector(`.combatant[data-combatant-id="${game.combat.combatants.getName(name).id}"]`);
      return [...(row?.querySelector(".token-initiative")?.classList ?? [])].filter(c => c.startsWith("stt-natural-"));
    };
    return { Aria: mark("Aria"), Borin: mark("Borin"), Goblin: mark("Goblin") };
  });
  assertEqual(marked, { Aria: ["stt-natural-20"], Borin: [], Goblin: ["stt-natural-1"] }, "the tracker's marks");
});

test("natural initiative: an initiative typed over a natural's has no natural", async ({ gm, player }) => {
  await startCombat(gm);
  await waitFor(player, () => game.combat?.combatants.size === 3, null, "the combat to reach the player");
  await rollInitiative(player, "Aria", 20);
  await setInitiative(gm, "Borin", 40);
  await setInitiative(gm, "Goblin", 30);
  await expectOrder(gm, ["Aria", "Borin", "Goblin"], "the order with Aria's natural 20");
  await setInitiative(gm, "Aria", 35);
  await expectOrder(gm, ["Borin", "Aria", "Goblin"], "the order once Aria's initiative is typed in");
  await expectOrder(player, ["Borin", "Aria", "Goblin"], "the player's order once Aria's initiative is typed in");
});

test("natural initiative: with the setting off, totals alone decide the order", async ({ gm, player }) => {
  try {
    await startCombat(gm);
    await waitFor(player, () => game.combat?.combatants.size === 3, null, "the combat to reach the player");
    await rollInitiative(player, "Aria", 20);
    await rollInitiative(gm, "Goblin", 1);
    await setInitiative(gm, "Borin", 40);
    await expectOrder(player, ["Aria", "Borin", "Goblin"], "the order with the setting on");

    // Turning it off sorts the combat again, there and then.
    await gm.eval(moduleId => game.settings.set(moduleId, "naturalInitiative", false), MODULE_ID);
    await expectOrder(gm, ["Borin", "Aria", "Goblin"], "the GM's order with the setting off");
    await expectOrder(player, ["Borin", "Aria", "Goblin"], "the player's order with the setting off");
    await setInitiative(gm, "Borin", -10);
    await expectOrder(gm, ["Aria", "Goblin", "Borin"], "the order with the setting off and a total below the natural 1");
  } finally {
    await gm.eval(moduleId => game.settings.set(moduleId, "naturalInitiative", true), MODULE_ID);
  }
});
