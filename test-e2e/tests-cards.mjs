/**
 * End-to-end tests for playing Hero Cards on rolls already in chat, and from the character sheet.
 *
 * Rolls are made in the player's browser through dnd5e's own roll methods, fast-forwarded, so the player is
 * the author as they would be at the table. Cards are then played through the real chat button and chooser.
 */

import { MODULE_ID } from "./config.mjs";
import {
  COMPAT, assert, assertEqual, clickRoll, forceDice, postRequest, test, waitFor, waitForCard
} from "./lib/harness.mjs";

const athletics = dc => ({ type: "skill", key: "ath", dc });

const d20 = n => [n, 20];

/**
 * Make a roll in a user's browser and return its chat message's ID.
 * @param {import("./lib/session.mjs").Session} session
 * @param {string} actor   The actor's name.
 * @param {string} kind    "skill", "save", "death", "attack", "damage" or "initiative".
 * @param {object} [options]
 * @param {object} [options.config]  Extra roll configuration, e.g. `{ target: 15 }` or `{ disadvantage: true }`.
 * @returns {Promise<string>}
 */
async function roll(session, actor, kind, { config = {} } = {}) {
  const id = await session.eval(async ({ actor: name, kind, config }) => {
    const actor = game.actors.getName(name);
    const before = new Set(game.messages.keys());
    const fast = { configure: false };
    const attack = () => actor.items.getName("Dagger").system.activities.find(a => a.type === "attack");
    switch ( kind ) {
      case "skill": await actor.rollSkill({ skill: "ath", ...config }, fast); break;
      case "save": await actor.rollSavingThrow({ ability: "wis", ...config }, fast); break;
      case "death": await actor.rollDeathSave({ ...config }, fast); break;
      case "attack": await attack().rollAttack({ ...config }, fast); break;
      case "damage": await attack().rollDamage({ ...config }, fast); break;
      case "initiative": await game.combat.rollInitiative(game.combat.combatants.map(c => c.id)); break;
    }
    await new Promise(r => setTimeout(r, 300));
    return game.messages.contents.find(m => !before.has(m.id) && m.rolls.length)?.id ?? null;
  }, { actor, kind, config });
  assert(id, `No ${kind} roll message was created for ${actor}.`);
  return id;
}

/**
 * The card button for a roll message, where the user sees it: on the message, or on its summary inside the
 * activity card that made it.
 * @param {import("./lib/session.mjs").Session} session
 * @param {string} id
 */
function cardButton(session, id) {
  return session.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-card-button:visible`);
}

/**
 * Open the card chooser for a roll and list what it offers. Plays `card` if given, otherwise cancels.
 * @param {import("./lib/session.mjs").Session} session
 * @param {string} id
 * @param {string} [card]
 * @returns {Promise<string[]>}  The cards offered, or an empty list if there was no card button.
 */
async function cardsOffered(session, id, card) {
  const button = cardButton(session, id);
  await session.page.waitForTimeout(300);
  if ( !(await button.count()) ) return [];
  await button.first().click();
  const dialog = session.page.locator(".stt-card-dialog.application").last();
  await dialog.locator(".stt-card-choice").first().waitFor({ timeout: 10_000 });
  const offered = await dialog.locator(".stt-card-choice").evaluateAll(els => els.map(el => el.dataset.card));
  if ( card ) {
    const choice = dialog.locator(`.stt-card-choice[data-card="${card}"]`);
    assert(await choice.count(), `${card} was not offered. Offered: ${offered.join(", ")}`);
    await choice.first().click();
  } else {
    await dialog.locator('button[data-action="cancel"]').click();
  }
  return offered;
}

/**
 * Wait for a roll message to record a card, and return its new total, its card notes, and its rolls' state.
 * @param {import("./lib/session.mjs").Session} session
 * @param {string} id
 * @param {number} [notes=1]  How many card notes to wait for.
 */
function afterCard(session, id, notes = 1) {
  return waitFor(session, ({ id, notes, moduleId }) => {
    const message = game.messages.get(id);
    const log = message?.getFlag(moduleId, "log") ?? [];
    if ( log.length < notes ) return null;
    const r = message.rolls[0];
    return {
      total: message.rolls.reduce((t, roll) => t + roll.total, 0), log: log.map(e => e.text ?? e),
      advantage: r.hasAdvantage ?? null, disadvantage: r.hasDisadvantage ?? null
    };
  }, { id, notes, moduleId: MODULE_ID }, "the card to be recorded on the roll");
}

/**
 * @param {import("./lib/session.mjs").Session} session
 * @param {string} card  The card activity's name.
 * @returns {Promise<number>}  Uses of the card left.
 */
function usesLeft(session, card) {
  return session.eval(card => game.actors.getName("Aria").items.getName("Hero Cards").system.activities
    .getName(card).uses.value, card);
}

/* -------------------------------------------- */
/*  Who Can Play Cards                          */
/* -------------------------------------------- */

test("cards: offered on the player's own roll, and not on rolls by someone without cards", async ({ gm, player }) => {
  await forceDice(player, [d20(5)]);
  const aria = await roll(player, "Aria", "skill");
  assert(await cardButton(player, aria).count(), "Aria's check has no card button for the player.");
  assert(await cardButton(gm, aria).count(), "The GM cannot play Aria's card on her check.");

  await forceDice(player, [d20(5)]);
  const borin = await roll(player, "Borin", "skill");
  assertEqual(await cardButton(player, borin).count(), 0, "card buttons on Borin's check, who has no cards");

  await forceDice(gm, [d20(5)]);
  const goblin = await roll(gm, "Goblin", "skill");
  assertEqual(await cardButton(player, goblin).count(), 0, "card buttons for the player on the GM's roll");
});

test("cards: a double click opens one card chooser, so only one card is spent", async ({ player }) => {
  await forceDice(player, [d20(5)]);
  const id = await roll(player, "Aria", "skill");
  const before = await usesLeft(player, "Lucky");
  // Both clicks land before the chooser opens, as a quick double click's would.
  await cardButton(player, id).first().evaluate(button => {
    button.click();
    button.click();
  });
  await player.page.waitForTimeout(500);
  const choosers = player.page.locator(".stt-card-dialog.application:has(.stt-card-choice)");
  assertEqual(await choosers.count(), 1, "card choosers open");

  await forceDice(player, [d20(14)]);
  await choosers.locator(".stt-card-choice", { hasText: "Lucky" }).first().click();
  const after = await afterCard(player, id);
  assertEqual(after.log.length, 1, "cards noted on the roll");
  assertEqual(await usesLeft(player, "Lucky"), before - 1, "Luck uses left");
});

test("cards: a card is given back, and the player told why, if its roll can't be changed", async ({ player }) => {
  await forceDice(player, [d20(5)]);
  const id = await roll(player, "Aria", "skill");
  const before = await usesLeft(player, "Lucky");
  // The next save of this roll fails, as it would if the server refused it.
  await player.eval(id => {
    const message = game.messages.get(id);
    message.update = async () => {
      delete message.update;
      throw new Error("The roll could not be saved.");
    };
  }, id);

  await forceDice(player, [d20(14)]);
  await cardsOffered(player, id, "Lucky");
  await waitFor(player, () => [...document.querySelectorAll("#notifications .notification.error")]
    .some(n => n.textContent.includes("The roll could not be saved.")), undefined, "the error to be shown");
  assertEqual(await usesLeft(player, "Lucky"), before, "Luck uses left");
  const log = await player.eval(({ id, moduleId }) => game.messages.get(id).getFlag(moduleId, "log") ?? [],
    { id, moduleId: MODULE_ID });
  assertEqual(log, [], "cards noted on the roll");
});

test("cards: none on a death saving throw", async ({ player }) => {
  await forceDice(player, [d20(5)]);
  const id = await roll(player, "Aria", "death");
  assertEqual(await cardButton(player, id).count(), 0, "card buttons on a death save");
});

/* -------------------------------------------- */
/*  Inspiration                                 */
/* -------------------------------------------- */

test("inspiration: adds its die to the check, and is spent", async ({ player }) => {
  await forceDice(player, [d20(5)]);
  const id = await roll(player, "Aria", "skill");
  await forceDice(player, [[4, 6]]);
  const offered = await cardsOffered(player, id, "Inspiration - 1d6");
  for ( const card of ["Inspiration - 1d6", "Inspiration - 1d8", "Inspiration - 1d10", "Lucky", "Advantage"] ) {
    assert(offered.includes(card), `${card} was not offered on a check. Offered: ${offered.join(", ")}`);
  }
  for ( const card of ["Indomitable", "Relentless"] ) {
    assert(!offered.includes(card), `${card} was offered on a check.`);
  }
  const result = await afterCard(player, id);
  assertEqual(result.total, 9, "total after Inspiration");
  assertEqual(result.log, ["Inspiration: added 1d6 (4): 5 + 4 = 9"], "the card's note");
  assertEqual(await usesLeft(player, "Inspiration - 1d6"), 0, "Inspiration - 1d6 uses left");

  const again = await cardsOffered(player, id);
  assert(!again.includes("Inspiration - 1d6"), "A spent card was offered again.");
});

/* -------------------------------------------- */
/*  Luck                                        */
/* -------------------------------------------- */

// Dice So Nice takes a die's appearance from the speaker's actor, so the card's dice must carry the roll's speaker.
// A stand-in records the call: the e2e world doesn't run Dice So Nice.
test("dice so nice: a card's dice are shown with the roll's speaker and message", async ({ player }) => {
  await player.eval(() => {
    window.dsnCalls = [];
    game.dice3d = { showForRoll: async (...args) => { window.dsnCalls.push(args); return true; } };
  });
  try {
    await forceDice(player, [d20(5)]);
    const id = await roll(player, "Aria", "skill");
    await forceDice(player, [d20(13)]);
    await cardsOffered(player, id, "Lucky");
    await afterCard(player, id);
    const calls = await player.eval(id => window.dsnCalls.map(([roll, user, , , , messageId, speaker]) => ({
      formula: roll.formula, user: user.id === game.user.id, messageId, actor: speaker?.actor,
      expected: game.messages.get(id).speaker.actor
    })), id);
    assertEqual(calls.length, 1, "Dice So Nice calls");
    const [call] = calls;
    assertEqual([call.formula, call.user, call.messageId, call.actor], ["1d20", true, id, call.expected],
      "the dice shown: formula, user, message and speaker's actor");
    assert(call.expected, "The roll has no speaker actor to compare with.");
  } finally {
    await player.eval(() => { delete game.dice3d; delete window.dsnCalls; });
  }
});

test("luck: rerolls the d20 of a check, and the new result stands", async ({ player }) => {
  await forceDice(player, [d20(5)]);
  const id = await roll(player, "Aria", "skill");
  await forceDice(player, [d20(3)]);
  await cardsOffered(player, id, "Lucky");
  const result = await afterCard(player, id);
  assertEqual(result.total, 3, "total after Luck, even though it is lower");
  assertEqual(result.log, ["Lucky: rerolled the d20 (5 → 3): 5 → 3"], "the card's note");
});

/**
 * Turn the "Natural 1s and 20s Lock Hero Cards" setting on or off, and wait for the player to see it.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {import("./lib/session.mjs").Session} player
 * @param {boolean} value
 */
async function setLockNaturals(gm, player, value) {
  await setSetting(gm, player, "lockNaturals", value);
}

/**
 * Change one of the module's world settings as the GM, and wait for it to reach the player.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {import("./lib/session.mjs").Session} player
 * @param {string} key
 * @param {*} value
 */
async function setSetting(gm, player, key, value) {
  await gm.eval(({ moduleId, key, value }) => game.settings.set(moduleId, key, value), { moduleId: MODULE_ID, key, value });
  await waitFor(player, ({ moduleId, key, value }) => game.settings.get(moduleId, key) === value,
    { moduleId: MODULE_ID, key, value }, "the setting to reach the player");
}

test("natural 1s and 20s: by default no card can be played on them", async ({ gm, player }) => {
  const setting = await gm.eval(moduleId => {
    const s = game.settings.settings.get(`${moduleId}.lockNaturals`);
    return { config: s?.config, scope: s?.scope, default: s?.default, value: game.settings.get(moduleId, "lockNaturals") };
  }, MODULE_ID);
  assertEqual(setting, { config: false, scope: "world", default: true, value: true }, "the setting");

  for ( const natural of [1, 20] ) {
    await forceDice(player, [d20(natural)]);
    const id = await roll(player, "Aria", "skill");
    assertEqual(await cardButton(player, id).count(), 0, `card buttons on a natural ${natural}`);
  }
  // Any other d20 keeps its cards, and so do rolls with no d20 at all.
  await forceDice(player, [d20(2)]);
  assert(await cardButton(player, await roll(player, "Aria", "skill")).count(), "No card button on a natural 2.");
  await forceDice(player, [[1, 4]]);
  assert(await cardButton(player, await roll(player, "Aria", "damage")).count(), "No card button on damage.");
});

test("natural 1s and 20s: the lock applies on a request card too", async (ctx) => {
  const { player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "standard", parts: [athletics(12)], actors: [ids.aria] });
  await forceDice(player, [d20(20)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  const card = await waitForCard(player, id, c => c.rows[0].results.length, "Aria's natural 20");
  assertEqual(card.rows[0].cardButton, false, "a card button beside a natural 20");
});

test("natural 1s and 20s: the total is ringed, in red or gold, and no other roll's is", async ({ player }) => {
  for ( const [natural, kind] of [[20, "save"], [20, "skill"], [20, "attack"], [1, "save"], [1, "skill"], [1, "attack"], [19, "save"], [2, "attack"]] ) {
    await forceDice(player, [d20(natural)]);
    const id = await roll(player, "Aria", kind);
    const dice = player.page.locator(`#chat .chat-log [data-message-id="${id}"] .message-content .dice-roll`);
    await dice.waitFor({ timeout: 5000 });
    const marks = await dice.evaluate(el => [1, 20].filter(n => el.matches(`.stt-natural-${n}, :has(.stt-natural-${n})`)));
    assertEqual(marks, [1, 20].includes(natural) ? [natural] : [], `ring on a ${kind} showing a natural ${natural}`);
  }
});

// Luck is never playable on a natural 1 or 20. With the lock off, the other cards are.
test("luck: never offered on a natural 1 or 20, even with the lock setting off", async ({ gm, player }) => {
  await setLockNaturals(gm, player, false);
  for ( const natural of [1, 20] ) {
    await forceDice(player, [d20(natural)]);
    const id = await roll(player, "Aria", "skill");
    const offered = await cardsOffered(player, id);
    assert(!offered.includes("Lucky"), `Luck was offered on a natural ${natural}.`);
    assert(offered.includes("Advantage"), `Advantage was not offered on a natural ${natural}.`);
  }
});

test("luck: rerolls every damage die", async ({ player }) => {
  await forceDice(player, [[1, 4]]);
  const id = await roll(player, "Aria", "damage");
  await forceDice(player, [[4, 4]]);
  const offered = await cardsOffered(player, id, "Lucky");
  assert(!offered.includes("Advantage"), "Advantage was offered on damage.");
  const result = await afterCard(player, id);
  assert(result.log[0].startsWith("Lucky: rerolled damage dice:"), `the card's note: ${result.log[0]}`);
  assertEqual(result.total - (await player.eval(id => game.messages.get(id).rolls[0].total, id)), 0, "damage recomputed");
  const [before, after] = result.log[0].match(/(\d+) → (\d+)/).slice(1).map(Number);
  assertEqual(after - before, 3, "damage after rerolling a 1 into a 4");
});

/* -------------------------------------------- */
/*  Advantage                                   */
/* -------------------------------------------- */

test("advantage: rolls a second d20 on a check and keeps the higher", async ({ player }) => {
  await forceDice(player, [d20(5)]);
  const id = await roll(player, "Aria", "skill");
  await forceDice(player, [d20(14)]);
  await cardsOffered(player, id, "Advantage");
  const result = await afterCard(player, id);
  assertEqual([result.total, result.advantage], [14, true], "total and mode after Advantage");
  assertEqual(result.log, ["Advantage: rolled with advantage (5 and 14): 5 → 14"], "the card's note");
});

test("advantage: on an attack roll, the higher d20 counts", async ({ player }) => {
  await forceDice(player, [d20(3)]);
  const id = await roll(player, "Aria", "attack");
  const before = await player.eval(id => game.messages.get(id).rolls[0].total, id);
  await forceDice(player, [d20(17)]);
  await cardsOffered(player, id, "Advantage");
  const result = await afterCard(player, id);
  assertEqual(result.total - before, 14, "attack total gained by keeping 17 over 3");
});

test("advantage: cancels disadvantage, leaving a straight roll of the first d20", async ({ player }) => {
  await forceDice(player, [d20(15), d20(3)]);
  const id = await roll(player, "Aria", "skill", { config: { disadvantage: true } });
  assertEqual(await player.eval(id => game.messages.get(id).rolls[0].total, id), 3, "total with disadvantage");
  await cardsOffered(player, id, "Advantage");
  const result = await afterCard(player, id);
  assertEqual([result.total, result.disadvantage], [15, false], "total and mode once cancelled");
  assertEqual(result.log, ["Advantage: cancelled disadvantage: 3 → 15"], "the card's note");
});

test("advantage: not offered on a roll that already has advantage", async ({ player }) => {
  await forceDice(player, [d20(4), d20(9)]);
  const id = await roll(player, "Aria", "skill", { config: { advantage: true } });
  const offered = await cardsOffered(player, id);
  assert(!offered.includes("Advantage"), "Advantage was offered on a roll with advantage.");
});

/* -------------------------------------------- */
/*  Indomitable                                 */
/* -------------------------------------------- */

test("indomitable: rerolls a failed saving throw only", async ({ player }) => {
  await forceDice(player, [d20(16)]);
  const passed = await roll(player, "Aria", "save", { config: { target: 15 } });
  assert(!(await cardsOffered(player, passed)).includes("Indomitable"), "Indomitable was offered on a passed save.");

  await forceDice(player, [d20(5)]);
  const failed = await roll(player, "Aria", "save", { config: { target: 15 } });
  await forceDice(player, [d20(18)]);
  await cardsOffered(player, failed, "Indomitable");
  const result = await afterCard(player, failed);
  assertEqual(result.total, 18, "save after Indomitable");
  assertEqual(await player.eval(id => game.messages.get(id).rolls[0].isSuccess, failed), true, "the save now passes");
});

// A natural 1 is fixed: with the lock off, cards that add to the roll can be played on it, but nothing rerolls it.
test("natural 1s: nothing rerolls one, even with the lock setting off", async ({ gm, player }) => {
  await setLockNaturals(gm, player, false);
  await forceDice(player, [d20(1)]);
  const save = await roll(player, "Aria", "save", { config: { target: 15 } });
  const offered = await cardsOffered(player, save);
  assert(offered.includes("Advantage"), `Advantage was not offered on a natural 1 save: ${offered.join(", ")}`);
  for ( const card of ["Lucky", "Indomitable"] ) assert(!offered.includes(card), `${card} was offered on a natural 1 save.`);

  await startCombat(gm, 1);
  await waitFor(player, () => !!game.combat?.combatants.size, null, "the combat to reach the player");
  await forceDice(player, [d20(1)]);
  const initiative = await roll(player, "Aria", "initiative");
  assert(!(await cardsOffered(player, initiative)).includes("Relentless"), "Relentless was offered on a natural 1.");
});

// The natural 1s and 20s lock keeps Indomitable off a natural 1 too, with or without a DC.
test("indomitable: locked on a natural 1 save, as the other cards are", async ({ player }) => {
  for ( const config of [{ target: 15 }, {}] ) {
    await forceDice(player, [d20(1)]);
    const id = await roll(player, "Aria", "save", { config });
    assertEqual(await cardButton(player, id).count(), 0, `card buttons on a natural 1 save (DC ${config.target ?? "none"})`);
  }
});

/* -------------------------------------------- */
/*  Relentless                                  */
/* -------------------------------------------- */

/**
 * Start a combat with Aria in it, as the GM.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {number} round
 */
function startCombat(gm, round) {
  return gm.eval(async round => {
    const combat = await Combat.create({ active: true, round });
    await combat.createEmbeddedDocuments("Combatant", [{ actorId: game.actors.getName("Aria").id }]);
    await combat.activate();
  }, round);
}

test("relentless: rerolls initiative in the first round and updates the tracker", async ({ gm, player }) => {
  await startCombat(gm, 1);
  await waitFor(player, () => !!game.combat?.combatants.size, null, "the combat to reach the player");
  await forceDice(player, [d20(3)]);
  const id = await roll(player, "Aria", "initiative");
  await forceDice(player, [d20(19)]);
  const offered = await cardsOffered(player, id, "Relentless");
  assert(!offered.includes("Indomitable"), "Indomitable was offered on initiative.");
  for ( const card of ["Inspiration - 1d6", "Inspiration - 1d8", "Inspiration - 1d10"] ) {
    assert(!offered.includes(card), `${card} was offered on initiative.`);
  }
  const result = await afterCard(player, id);
  const initiative = await waitFor(gm, total => {
    const value = game.combat.combatants.contents[0].initiative;
    return value === total ? value : null;
  }, result.total, "the tracker to show the new initiative");
  assertEqual(initiative, result.total, "combatant initiative");
  assert(result.log[0].startsWith("Relentless: rerolled the d20 (3 → 19)"), `the card's note: ${result.log[0]}`);
});

test("relentless: a lower reroll keeps the initiative it had", async ({ gm, player }) => {
  await startCombat(gm, 1);
  await waitFor(player, () => !!game.combat?.combatants.size, null, "the combat to reach the player");
  await forceDice(player, [d20(15)]);
  const id = await roll(player, "Aria", "initiative");
  const before = await player.eval(id => game.messages.get(id).rolls[0].total, id);
  const uses = await usesLeft(player, "Relentless");
  await forceDice(player, [d20(4)]);
  await cardsOffered(player, id, "Relentless");
  const result = await afterCard(player, id);
  assertEqual(result.total, before, "initiative after a lower reroll");
  assertEqual(result.log, [`Relentless: rerolled the d20 (15 → 4): ${before} or ${before - 11}, keeping ${before}`],
    "the card's note");
  assertEqual(await usesLeft(player, "Relentless"), uses - 1, "Relentless uses left, spent even though the reroll was lower");
});

test("relentless: not offered after the first round", async ({ gm, player }) => {
  await startCombat(gm, 2);
  await waitFor(player, () => game.combat?.round === 2, null, "round 2 to reach the player");
  await forceDice(player, [d20(3)]);
  const id = await roll(player, "Aria", "initiative");
  assert(!(await cardsOffered(player, id)).includes("Relentless"), "Relentless was offered in round 2.");
});

/* -------------------------------------------- */
/*  The Card Window on the Sheet                */
/* -------------------------------------------- */

/**
 * Use the Hero Cards feature as the player, as clicking it on the sheet does.
 * @param {import("./lib/session.mjs").Session} player
 * @param {object} [event]  Modifier keys held.
 */
function useFeature(player, event = {}) {
  return player.eval(event => {
    game.actors.getName("Aria").items.getName("Hero Cards").use({ event });
  }, event);
}

/**
 * Confirm spending the chosen card's use, as dnd5e asks for any activity used from the sheet. RSReforged uses it straight
 * away instead, unless Shift is held.
 * @param {import("./lib/session.mjs").Session} player
 */
async function confirmUsage(player) {
  if ( await player.eval(() => game.modules.get("rsreforged")?.active) ) return;
  await player.page.locator(".application.activity-usage button", { hasText: "Use Ability" }).click();
}

test("sheet: the card window shows every card left, with its art", async ({ player }) => {
  await useFeature(player);
  const dialog = player.page.locator(".stt-card-dialog.application").last();
  await dialog.locator(".stt-card-choice").first().waitFor({ timeout: 10_000 });
  const cards = await dialog.locator(".stt-card-choice").evaluateAll(els => els.map(el => ({
    label: el.querySelector("span").textContent.trim(), img: el.querySelector("img").getAttribute("src")
  })));
  assertEqual(cards.length, 12, "cards shown");
  for ( const { label, img } of cards ) {
    assert(img.startsWith("modules/sogrom-table-tools/assets/images/"), `${label} shows ${img} rather than its card art.`);
  }
  // The art may still be loading as the window opens, so each image is waited for until it loads or fails.
  const broken = await dialog.locator(".stt-card-choice img").evaluateAll(async imgs => {
    await Promise.all(imgs.map(i => i.complete || new Promise(resolve => {
      i.addEventListener("load", resolve, { once: true });
      i.addEventListener("error", resolve, { once: true });
    })));
    return imgs.filter(i => !i.naturalWidth).map(i => i.getAttribute("src"));
  });
  assertEqual(broken, [], "card art that failed to load");
  await dialog.locator('button[data-action="cancel"]').click();
});

test("sheet: Advantage gives advantage on the next d20 roll, once", async ({ player }) => {
  await useFeature(player);
  const dialog = player.page.locator(".stt-card-dialog.application").last();
  await dialog.locator(".stt-card-choice", { hasText: "Advantage" }).click();
  await confirmUsage(player);
  await waitFor(player, () => game.actors.getName("Aria").getFlag("sogrom-table-tools", "advantage"), null,
    "the pending Advantage flag");
  assertEqual(await usesLeft(player, "Advantage"), 0, "Advantage uses left");

  await forceDice(player, [d20(4), d20(17)]);
  const first = await roll(player, "Aria", "skill");
  assertEqual(await player.eval(id => {
    const r = game.messages.get(id).rolls[0];
    return [r.hasAdvantage, r.total];
  }, first), [true, 17], "the next check");
  await waitFor(player, () => !game.actors.getName("Aria").getFlag("sogrom-table-tools", "advantage"), null,
    "the pending Advantage to clear");

  await forceDice(player, [d20(4)]);
  const second = await roll(player, "Aria", "skill");
  assertEqual(await player.eval(id => game.messages.get(id).rolls[0].hasAdvantage, second), false, "the check after");
});

test("sheet: a warning when every card is spent", async ({ gm, player }) => {
  await gm.eval(async () => {
    const item = game.actors.getName("Aria").items.getName("Hero Cards");
    await item.update(Object.fromEntries(item.system.activities.map(a => [`system.activities.${a.id}.uses.spent`, 1])));
  });
  await waitFor(player, () => game.actors.getName("Aria").items.getName("Hero Cards").system.activities
    .every(a => !a.uses.value), null, "the spent cards to reach the player");
  await useFeature(player);
  const warning = await player.eval(() => game.i18n.localize("STT.Cards.NoneLeft"));
  await player.page.locator("#notifications .notification", { hasText: warning })
    .waitFor({ timeout: 5000 }).catch(() => { throw new Error("No warning that every card is spent."); });
  assertEqual(await player.page.locator(".stt-card-dialog.application").count(), 0, "card windows opened");
});

test("sheet: shift-click uses dnd5e's own activity list instead", async ({ player }) => {
  await useFeature(player, { shiftKey: true });
  await player.page.waitForTimeout(1500);
  assertEqual(await player.page.locator(".stt-card-dialog.application").count(), 0, "Hero Card windows");
  const apps = await player.eval(() => [...foundry.applications.instances.values()].filter(a => a.rendered)
    .map(a => a.constructor.name));
  assert(apps.some(n => /Activit/i.test(n)), `dnd5e's activity list did not open. Open: ${apps.join(", ")}`);
});

/* -------------------------------------------- */
/*  Showing a Played Card                       */
/* -------------------------------------------- */

/**
 * @param {import("./lib/session.mjs").Session} session
 * @returns {Promise<object|null>}  The played card on the user's screen, if one is showing.
 */
function playedCardOnScreen(session) {
  return session.eval(() => {
    const el = document.getElementById("stt-played-card");
    if ( !el ) return null;
    return {
      img: el.querySelector("img")?.getAttribute("src"),
      by: el.querySelector(".stt-played-card-by")?.textContent.trim(),
      name: el.querySelector(".stt-played-card-name")?.textContent.trim()
    };
  });
}

test("played cards: shown on everyone's screen, with no chat card pushing the roll up", async ({ gm, player }) => {
  const setting = await gm.eval(moduleId => {
    const s = game.settings.settings.get(`${moduleId}.showPlayedCards`);
    return { config: s?.config, scope: s?.scope, default: s?.default };
  }, MODULE_ID);
  assertEqual(setting, { config: false, scope: "world", default: true }, "the setting");

  await forceDice(player, [d20(5)]);
  const id = await roll(player, "Aria", "skill");
  const before = await gm.eval(() => game.messages.size);
  await forceDice(player, [d20(14)]);
  await cardsOffered(player, id, "Lucky");
  await afterCard(player, id);

  for ( const session of [gm, player] ) {
    const shown = await waitFor(session, () => {
      const el = document.getElementById("stt-played-card");
      return el ? true : null;
    }, null, `the played card on ${session.user}'s screen`, 3000);
    assert(shown, "No played card.");
    assertEqual(await playedCardOnScreen(session), {
      img: "modules/sogrom-table-tools/assets/images/lucky.webp", by: "Aria plays", name: "Lucky"
    }, `the played card (${session.user})`);
  }
  assertEqual(await gm.eval(() => game.messages.size), before, "chat messages after playing the card");
  assertEqual(await usesLeft(player, "Lucky"), 0, "Luck uses left, spent without a chat card");

  await waitFor(player, () => !document.getElementById("stt-played-card"), null, "the played card to go", 6000);
});

test("played cards: clicking the card dismisses it early", async ({ player }) => {
  await forceDice(player, [d20(5)]);
  const id = await roll(player, "Aria", "skill");
  await forceDice(player, [d20(14)]);
  await cardsOffered(player, id, "Advantage");
  await player.page.locator("#stt-played-card img").click({ timeout: 3000 });
  await waitFor(player, () => !document.getElementById("stt-played-card"), null, "the played card to go", 1500);
});

test("played cards: up to three played together show side by side, and the rest wait their turn", async ({ gm, player }) => {
  const cards = ["Lucky", "Advantage", "Charger", "Relentless"];
  const ids = await gm.eval(async n => {
    const messages = await ChatMessage.create(Array.from({ length: n }, (_, i) => ({ content: `Roll ${i}` })));
    return messages.map(m => m.id);
  }, cards.length);
  await waitFor(player, ids => ids.every(id => game.messages.has(id)), ids, "the messages to reach the player");
  // Every card is played at once, as players acting together would.
  await gm.eval(({ ids, cards, moduleId }) => Promise.all(ids.map((id, i) => game.messages.get(id).setFlag(moduleId, "log",
    [{ text: `${cards[i]}: played`, card: cards[i], img: `modules/${moduleId}/assets/images/lucky.webp`, by: "Aria" }]
  ))), { ids, cards, moduleId: MODULE_ID });

  // The updates may arrive in any order, so which card waits is whichever one was not shown first.
  let first;
  for ( const session of [gm, player] ) {
    await waitFor(session, () => document.querySelectorAll("#stt-played-card .stt-played-card-entry").length === 3,
      null, `three cards on ${session.user}'s screen`, 3000);
    // They slide in, so they are measured once they have settled in one row.
    await waitFor(session, () => new Set([...document.querySelectorAll("#stt-played-card .stt-played-card-entry img")]
      .map(img => Math.round(img.getBoundingClientRect().top))).size === 1, null, `one row on ${session.user}'s screen`, 3000)
      .catch(() => {});
    const shown = await session.eval(() => [...document.querySelectorAll("#stt-played-card .stt-played-card-entry")]
      .map(el => ({
        name: el.querySelector(".stt-played-card-name").textContent,
        top: Math.round(el.querySelector("img").getBoundingClientRect().top)
      })));
    assertEqual(shown.length, 3, `cards on ${session.user}'s screen, with one waiting`);
    assert(shown.every(c => cards.includes(c.name)), `Unexpected cards shown: ${shown.map(c => c.name).join(", ")}`);
    assertEqual(new Set(shown.map(c => c.top)).size, 1, `rows the cards sit in (${session.user})`);
    if ( session === player ) first = shown.map(c => c.name);
  }

  // Once the first three go, the fourth gets its turn.
  const waiting = cards.find(c => !first.includes(c));
  await waitFor(player, waiting => {
    const names = [...document.querySelectorAll("#stt-played-card .stt-played-card-entry:not(.leaving)")]
      .map(el => el.querySelector(".stt-played-card-name").textContent);
    return (names.length === 1) && (names[0] === waiting);
  }, waiting, "the waiting card to be shown", 5000);
  await waitFor(player, () => !document.getElementById("stt-played-card"), null, "every played card to go", 5000);
});

test("played cards: the roll's note carries a thumbnail of the card, full size on hover", async ({ player }) => {
  await forceDice(player, [d20(5)]);
  const id = await roll(player, "Aria", "skill");
  await forceDice(player, [[3, 8]]);
  await cardsOffered(player, id, "Inspiration - 1d8");
  await afterCard(player, id);
  const art = player.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-card-log .stt-card-log-art`);
  await art.waitFor({ timeout: 5000 });
  assertEqual(await art.getAttribute("src"), "modules/sogrom-table-tools/assets/images/inspiration1d8.webp", "the thumbnail");
  assert((await art.getAttribute("data-tooltip-html")).includes("inspiration1d8.webp"), "The thumbnail has no full-size art.");
  const loaded = await art.evaluate(img => img.complete && img.naturalWidth > 0);
  assert(loaded, "The thumbnail's art did not load.");
  const note = await player.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-card-log`).textContent();
  assertEqual(note.replace(/\s+/g, " ").trim(), "Inspiration: added 1d8 (3): 5 + 3 = 8", "the note, with no Hero Cards label beside the thumbnail");
});

test("played cards: with the setting off, nothing is shown on screen, but the note keeps its thumbnail", async ({ gm, player }) => {
  await gm.eval(moduleId => game.settings.set(moduleId, "showPlayedCards", false), MODULE_ID);
  await waitFor(player, moduleId => game.settings.get(moduleId, "showPlayedCards") === false, MODULE_ID, "the setting");
  await forceDice(player, [d20(5)]);
  const id = await roll(player, "Aria", "skill");
  await forceDice(player, [d20(16)]);
  await cardsOffered(player, id, "Lucky");
  await afterCard(player, id);
  await player.page.waitForTimeout(800);
  assertEqual(await playedCardOnScreen(player), null, "the played card on the player's screen");
  assertEqual(await playedCardOnScreen(gm), null, "the played card on the GM's screen");
  assertEqual(await player.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-card-log-art`).count(), 1,
    "the note's thumbnail");
});

test("played cards: a card played from the sheet is shown on screen, with a short record in chat", async ({ gm, player }) => {
  await useFeature(player);
  const dialog = player.page.locator(".stt-card-dialog.application").last();
  await dialog.locator(".stt-card-choice", { hasText: "Charger" }).click();
  await confirmUsage(player);

  for ( const session of [gm, player] ) {
    await waitFor(session, () => !!document.getElementById("stt-played-card"), null,
      `the played card on ${session.user}'s screen`, 5000);
    assertEqual(await playedCardOnScreen(session), {
      img: "modules/sogrom-table-tools/assets/images/charger.webp", by: "Aria plays", name: "Charger"
    }, `the played card (${session.user})`);
  }

  // The chat record: the description, which holds the full card art, starts collapsed.
  const record = player.page.locator("#chat .chat-log li.chat-message.stt-card-usage").last();
  await record.waitFor({ timeout: 5000 });
  const state = await record.evaluate(li => ({
    collapsed: li.querySelector(".card-description")?.classList.contains("collapsed"),
    descriptionHeight: li.querySelector(".card-description .collapsible-content")?.getBoundingClientRect().height,
    tags: li.querySelector(".icon-row:has(.fa-tag)") ? getComputedStyle(li.querySelector(".icon-row:has(.fa-tag)")).display : null,
    hoverArt: li.querySelector(".activity-icon img")?.dataset.tooltipHtml ?? null,
    height: li.getBoundingClientRect().height
  }));
  assertEqual(state.collapsed, true, "the description collapsed");
  assertEqual(state.tags, "none", "the tag row");
  assert(state.hoverArt?.includes("charger.webp"), `The header's art has no full-size hover: ${state.hoverArt}`);
  assert(state.height < 200, `The chat record is ${state.height}px tall.`);

  // Clicking the header still opens the description.
  await record.locator(".card-header").click();
  await waitFor(player, () => {
    const li = [...document.querySelectorAll("#chat .chat-log li.chat-message.stt-card-usage")].at(-1);
    return !li.querySelector(".card-description").classList.contains("collapsed");
  }, null, "the description to open");
});

test("sheet: Divine Intervention whispers the GM a button that opens the request window set up for it", async ({ gm, player }) => {
  await useFeature(player);
  const dialog = player.page.locator(".stt-card-dialog.application").last();
  await dialog.locator(".stt-card-choice", { hasText: "Divine Intervention" }).click();
  await confirmUsage(player);

  const note = await waitFor(gm, () => game.messages.contents.findLast(m => m.getFlag("sogrom-table-tools", "divineSetup"))
    ?.id, null, "the note to the GM", 5000);
  assertEqual(await gm.eval(id => {
    const m = game.messages.get(id);
    const gms = game.users.filter(u => u.isGM).map(u => u.id);
    return [m.getFlag("sogrom-table-tools", "divineSetup") === game.actors.getName("Aria").uuid,
      m.whisper.length > 0 && m.whisper.every(u => gms.includes(u))];
  }, note), [true, true], "the note's actor, and that only GMs are whispered");

  // Only the GM gets the button.
  const button = id => `#chat .chat-log li.chat-message[data-message-id="${id}"] .stt-divine-setup`;
  await waitFor(player, id => !!document.querySelector(`#chat li.chat-message[data-message-id="${id}"]`), note,
    "the note in the player's chat");
  assertEqual(await player.page.locator(button(note)).count(), 0, "set-up buttons for the player");

  await gm.page.locator(button(note)).click();
  const app = gm.page.locator("#stt-roll-request");
  await app.waitFor({ timeout: 5000 });
  const form = await app.evaluate(el => ({
    mode: el.querySelector('input[name="mode"]:checked')?.value,
    actors: [...el.querySelectorAll('input[name="actor"]:checked')]
      .map(box => box.closest("label")?.textContent.trim())
  }));
  assertEqual(form, { mode: "divine", actors: ["Aria"] }, "the request window");
  await gm.eval(() => foundry.applications.instances.get("stt-roll-request")?.close());
});

test("cards: a roll keeps its note once no card is left to play on it", async ({ player }) => {
  await forceDice(player, [d20(5)]);
  const id = await roll(player, "Aria", "skill");
  // Luck rerolls into a natural 20, which locks every other card, so the card button goes.
  await forceDice(player, [d20(20)]);
  await cardsOffered(player, id, "Lucky");
  await afterCard(player, id);
  await waitFor(player, id => !document.querySelector(`#chat .chat-log [data-message-id="${id}"] .stt-card-button`),
    id, "the card button to go");
  const note = await player.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-card-log`).count();
  assertEqual(note, 1, "notes on the roll");
});

/* -------------------------------------------- */

test("played cards: a note's art is never run as HTML, on the screen or in its tooltip", async ({ gm, player }) => {
  const id = await player.eval(async () => (await ChatMessage.create({ content: "A roll" })).id);
  await waitFor(gm, id => game.messages.has(id), id, "the message to reach the GM");
  // Written by hand, as only a player meddling from the console could.
  await player.eval(async ({ id, moduleId }) => {
    const img = 'x" onerror="window.__sttInjected = true';
    await game.messages.get(id).setFlag(moduleId, "log", [{ text: "Lucky: rerolled", card: "<b>Lucky</b>", img, by: "Aria" }]);
  }, { id, moduleId: MODULE_ID });
  await waitFor(gm, () => !!document.getElementById("stt-played-card"), null, "the played card on the GM's screen");
  await gm.page.waitForTimeout(500);
  const seen = await gm.eval(id => ({
    injected: !!window.__sttInjected,
    src: document.querySelector("#stt-played-card img")?.getAttribute("src"),
    name: document.querySelector("#stt-played-card .stt-played-card-name")?.textContent,
    tooltip: document.querySelector(`#chat .chat-log li[data-message-id="${id}"] .stt-card-log-art`)?.dataset.tooltipHtml
  }), id);
  assertEqual(seen.injected, false, "script run from the note's art");
  assertEqual(seen.src, 'x" onerror="window.__sttInjected = true', "the played card's art, kept as plain text");
  assertEqual(seen.name, "<b>Lucky</b>", "the played card's name, kept as plain text");
  assert(seen.tooltip?.startsWith('<img src="x&quot; onerror'), `The note's tooltip wasn't escaped: ${seen.tooltip}`);
});

test("played cards: a card played on a roll the player can't see isn't shown to them", async ({ gm, player }) => {
  const id = await gm.eval(async () => {
    const roll = await new Roll("1d20").evaluate();
    return (await roll.toMessage({ flavor: "Secret" }, { rollMode: "gmroll" })).id;
  });
  await player.page.waitForTimeout(500);
  await gm.eval(async ({ id, moduleId }) => {
    const img = `modules/${moduleId}/assets/images/lucky.webp`;
    await game.messages.get(id).setFlag(moduleId, "log", [{ text: "Lucky: rerolled", card: "Lucky", img, by: "Goblin" }]);
  }, { id, moduleId: MODULE_ID });
  await waitFor(gm, () => !!document.getElementById("stt-played-card"), null, "the played card on the GM's screen");
  await player.page.waitForTimeout(500);
  assertEqual(await player.eval(() => !!document.getElementById("stt-played-card")), false, "the card on the player's screen");
});

/**
 * Cast Sacred Flame as Aria and roll her saving throw against it, as its card's Save button does, so dnd5e summarises
 * the save inside the spell's card.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {import("./lib/session.mjs").Session} player
 * @returns {Promise<{ usage: string, save: string }>}  The spell card's and the save's message IDs.
 */
async function saveAgainstSpell(gm, player) {
  await gm.eval(async () => {
    const aria = game.actors.getName("Aria");
    if ( aria.items.getName("Sacred Flame") ) return;
    const spell = (await game.packs.get("dnd5e.spells").getDocuments({ name: "Sacred Flame" }))[0];
    await aria.createEmbeddedDocuments("Item", [game.items.fromCompendium(spell)]);
  });
  await waitFor(player, () => !!game.actors.getName("Aria").items.getName("Sacred Flame"), null, "the spell to reach the player");
  return player.eval(async () => {
    const aria = game.actors.getName("Aria");
    const activity = aria.items.getName("Sacred Flame").system.activities.find(a => a.type === "save");
    const { message } = await activity.use({}, { configure: false });
    const [roll] = await aria.rollSavingThrow({ ability: "dex", target: activity.save.dc.value }, { configure: false }, {
      data: { system: { ...activity.messageSources, origin: message.id } }
    });
    return { usage: message.id, save: roll.parent?.id ?? game.messages.contents.at(-1).id };
  });
}

/**
 * The ring on a save summarised inside a spell's card, as a user sees it.
 * @param {import("./lib/session.mjs").Session} session
 * @param {{ usage: string, save: string }} ids
 * @returns {Promise<number[]>}  The naturals ringed: [1], [20] or [].
 */
async function summaryMarks(session, { usage, save }) {
  const dice = session.page.locator(
    `#chat .chat-log [data-message-id="${usage}"] .card-summary[data-message-id="${save}"] .dice-roll`);
  await dice.waitFor({ timeout: 5000 });
  return dice.evaluate(el => [1, 20].filter(n => el.matches(`.stt-natural-${n}, :has(.stt-natural-${n})`)));
}

test("natural 1s and 20s: a save summarised inside a spell's card is ringed too", async ({ gm, player }) => {
  for ( const natural of [20, 1, 12] ) {
    await forceDice(player, [d20(natural)]);
    const ids = await saveAgainstSpell(gm, player);
    for ( const session of [player, gm] ) {
      assertEqual(await summaryMarks(session, ids), [1, 20].includes(natural) ? [natural] : [],
        `ring on a summarised save showing a natural ${natural} (${session.user})`);
    }
  }
}, { skip: { midi: "Midi-QOL lists saves on its own card in place of dnd5e's summary; see the compatibility tests." } });

test("natural 1s and 20s: the ring setting exists, is on by default, and turning it off removes every ring", async (ctx) => {
  const { gm, player, ids } = ctx;
  const setting = await gm.eval(moduleId => {
    const s = game.settings.settings.get(`${moduleId}.markNaturals`);
    return { config: s?.config, scope: s?.scope, default: s?.default, value: game.settings.get(moduleId, "markNaturals") };
  }, MODULE_ID);
  assertEqual(setting, { config: false, scope: "world", default: true, value: true }, "the setting");

  await forceDice(player, [d20(20)]);
  const attack = await roll(player, "Aria", "attack");
  await waitFor(player, id => !!document.querySelector(`#chat .chat-log [data-message-id="${id}"] .stt-natural-20`),
    attack, "the attack's ring");

  await setSetting(gm, player, "markNaturals", false);
  await waitFor(player, id => !document.querySelector(`#chat .chat-log [data-message-id="${id}"] .stt-natural-20`),
    attack, "the attack's ring to go once the setting is off");

  for ( const kind of ["save", "attack"] ) {
    await forceDice(player, [d20(20)]);
    const id = await roll(player, "Aria", kind);
    const marked = player.page.locator(`#chat .chat-log [data-message-id="${id}"] :is(.stt-natural-1, .stt-natural-20)`);
    await player.page.locator(`#chat .chat-log [data-message-id="${id}"] .dice-roll`).first().waitFor({ timeout: 5000 });
    assertEqual(await marked.count(), 0, `rings on a ${kind} with the setting off`);
  }

  // Midi-QOL lists saves on its own card in place of dnd5e's summary.
  if ( COMPAT !== "midi" ) {
    await forceDice(player, [d20(1)]);
    assertEqual(await summaryMarks(player, await saveAgainstSpell(gm, player)), [], "ring on a summarised save, setting off");
  }

  const request = await postRequest(ctx, { mode: "standard", parts: [athletics(12)], actors: [ids.aria] });
  await forceDice(player, [d20(20)]);
  await clickRoll(player, request, "Aria", { fastForward: true });
  const card = await waitForCard(player, request, c => c.rows[0].results.length, "Aria's natural 20");
  assert(!card.rows[0].results[0].classes.includes("critical"), "The request card's result is ringed with the setting off.");
});
