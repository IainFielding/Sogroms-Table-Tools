/**
 * Compatibility checks, run against other modules that change dnd5e's rolls or chat cards: RSReforged, Midi-QOL and
 * Carolingian UI. `STT_COMPAT=rsr npm run test:e2e -- compat` (or `midi`, or `crlngn`) runs them in a world with that
 * module enabled; without `STT_COMPAT` they run in the plain test world, which is the baseline.
 *
 * Unlike the other tests, rolls here go through `activity.use()`, as a click on the character sheet does, since that is
 * the path the other modules take over.
 */

import { MODULE_ID } from "./config.mjs";
import {
  COMPAT, assert, assertEqual, forceDice, postRequest, test, waitFor, waitForCard, waitForRoll
} from "./lib/harness.mjs";

const d20 = n => [n, 20];

/**
 * Turn on Midi-QOL's "full auto" sample settings, as a table running Midi typically has, if Midi is active.
 * @param {import("./lib/session.mjs").Session} gm
 */
async function configureMidi(gm) {
  const changed = await gm.eval(async () => {
    if ( !game.modules.get("midi-qol")?.active ) return false;
    if ( game.settings.get("midi-qol", "ConfigSettings")?.autoRollAttack ) return false;
    const json = await (await fetch("/modules/midi-qol/sample-config/midi-qol-full-auto.json")).json();
    await globalThis.MidiQOL.importSettingsFromJSON(json);
    return true;
  });
  if ( changed ) await gm.reload();
}

/**
 * Use Aria's Dagger attack as the player, as a click on the sheet would, and return the attack roll's message. If the
 * use only posts the item's card, as plain dnd5e does, its attack is then rolled as the card's Attack button would.
 * @param {import("./lib/session.mjs").Session} player
 * @param {string} [name]  Another of Aria's weapons to attack with.
 * @param {object} [options]
 * @param {boolean} [options.rollFromCard=true]  Roll the attack from the item's card if the use doesn't roll it.
 * @returns {Promise<string|null>}
 */
async function useDaggerAttack(player, name = "Dagger", { rollFromCard = true } = {}) {
  return player.eval(async ({ name, rollFromCard }) => {
    const before = new Set(game.messages.keys());
    const activity = game.actors.getName("Aria").items.getName(name).system.activities.find(a => a.type === "attack");
    const fresh = type => game.messages.contents.find(m => !before.has(m.id) && (m.type === type));
    await activity.use({}, { configure: false }, {});
    for ( let i = 0; (i < 20) && !fresh("attack"); i++ ) await new Promise(r => setTimeout(r, 100));
    if ( !fresh("attack") && rollFromCard ) await activity.rollAttack({}, { configure: false });
    await new Promise(r => setTimeout(r, 1000));
    return fresh("attack")?.id ?? null;
  }, { name, rollFromCard });
}

/**
 * Use one of Aria's weapons as the player, as a click on the sheet would, and return whether the attack roll had
 * disadvantage. The roll is looked for on any card the use posts, since Midi-QOL rolls it onto its own card rather than
 * a message of the attack type. Only if no module rolled it is it rolled as the card's Attack button would.
 * @param {import("./lib/session.mjs").Session} player
 * @param {string} name
 * @returns {Promise<boolean|null>}  Null if no attack was rolled.
 */
function attackDisadvantage(player, name) {
  return player.eval(async name => {
    for ( let i = 0; (i < 50) && !game.actors.getName("Aria").items.getName(name); i++ ) {
      await new Promise(r => setTimeout(r, 100));
    }
    const before = new Set(game.messages.keys());
    const activity = game.actors.getName("Aria").items.getName(name).system.activities.find(a => a.type === "attack");
    const rolled = () => game.messages.contents.filter(m => !before.has(m.id)).flatMap(m => m.rolls)
      .find(r => r instanceof CONFIG.Dice.D20Roll);
    await activity.use({}, { configure: false }, {});
    const wait = game.modules.get("midi-qol")?.active ? 80 : 20;
    for ( let i = 0; (i < wait) && !rolled(); i++ ) await new Promise(r => setTimeout(r, 100));
    if ( !rolled() ) await activity.rollAttack({}, { configure: false });
    return rolled()?.hasDisadvantage ?? null;
  }, name);
}

/**
 * Give Aria a weapon from dnd5e's SRD items, changed as given, as the GM.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {string} name
 * @param {object} [changes]
 * @returns {Promise<string>}  The new item's ID.
 */
function giveWeapon(gm, name, changes = {}) {
  return gm.eval(async ({ name, changes }) => {
    const source = (await game.packs.get("dnd5e.items").getDocuments({ name }))[0];
    const data = foundry.utils.mergeObject(game.items.fromCompendium(source), changes);
    return (await game.actors.getName("Aria").createEmbeddedDocuments("Item", [data]))[0].id;
  }, { name, changes });
}

/**
 * Take an item back from Aria, as the GM.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {string} id
 */
function takeItem(gm, id) {
  return gm.eval(id => game.actors.getName("Aria").items.get(id)?.delete(), id);
}

/**
 * Where a roll's Hero Card button can be seen: on its own message, or inside another card showing that roll.
 * @param {import("./lib/session.mjs").Session} session
 * @param {string} id  The roll message's ID.
 * @returns {Promise<number>}  Visible card buttons for the roll.
 */
function visibleCardButtons(session, id) {
  return session.eval(id => [...document.querySelectorAll("#chat .chat-log .stt-card-button")].filter(button => {
    const owner = button.closest("[data-message-id]");
    return (owner?.dataset.messageId === id) && (button.offsetParent !== null);
  }).length, id);
}

/**
 * Click the first visible card button for a roll and play a card.
 * @param {import("./lib/session.mjs").Session} session
 * @param {string} id
 * @param {string} card
 */
async function playCardOn(session, id, card) {
  await session.eval(id => [...document.querySelectorAll("#chat .chat-log .stt-card-button")]
    .find(b => (b.closest("[data-message-id]")?.dataset.messageId === id) && (b.offsetParent !== null)).click(), id);
  const dialog = session.page.locator(".stt-card-dialog.application").last();
  await dialog.locator(".stt-card-choice").first().waitFor({ timeout: 10_000 });
  const choice = dialog.locator(`.stt-card-choice[data-card="${card}"]`);
  assert(await choice.count(), `${card} was not offered.`);
  await choice.first().click();
}

/**
 * The roll's totals as the user sees them: every total shown for the roll, wherever it is shown.
 * @param {import("./lib/session.mjs").Session} session
 * @param {string} id
 * @returns {Promise<string[]>}
 */
function shownTotals(session, id) {
  return session.eval(id => [...document.querySelectorAll("#chat .chat-log .dice-total, #chat .chat-log .dice-roll .total")]
    .filter(el => (el.closest("[data-message-id]")?.dataset.messageId === id) && (el.offsetParent !== null))
    .map(el => el.textContent.replace(/\s+/g, " ").trim()), id);
}

/**
 * Roll Aria's Athletics as the player, fast-forwarded, and return its message once it has been drawn.
 * @param {import("./lib/session.mjs").Session} player
 * @returns {Promise<string>}
 */
async function rollAthletics(player) {
  const id = await player.eval(async () => {
    const before = new Set(game.messages.keys());
    await game.actors.getName("Aria").rollSkill({ skill: "ath" }, { configure: false });
    await new Promise(r => setTimeout(r, 1200));
    return game.messages.contents.find(m => !before.has(m.id) && m.rolls.length)?.id ?? null;
  });
  assert(id, "No Athletics roll was made.");
  return id;
}

/* -------------------------------------------- */

test("compat: the modules under test are active", async ({ gm }) => {
  await configureMidi(gm);
  const active = await gm.eval(() => ["rsreforged", "midi-qol", "crlngn-ui"].filter(id => game.modules.get(id)?.active));
  console.log(`      active: ${active.join(", ") || "none (baseline)"}`);
});

test("compat: an attack used from the sheet has a Hero Card button", async ({ player }) => {
  await forceDice(player, [d20(8), [2, 4], [2, 4]]);
  const id = await useDaggerAttack(player);
  assert(id, "No attack roll message was created.");
  assert(await visibleCardButtons(player, id), "The attack roll has no visible Hero Card button.");
});

test("compat: Advantage played on an attack used from the sheet changes the roll everyone sees", async ({ player }) => {
  await forceDice(player, [d20(8), [2, 4], [2, 4]]);
  const id = await useDaggerAttack(player);
  assert(id, "No attack roll message was created.");
  assert(await visibleCardButtons(player, id), "The attack roll has no visible Hero Card button.");
  await forceDice(player, [d20(17)]);
  await playCardOn(player, id, "Advantage");
  const after = await waitFor(player, ({ id, moduleId }) => {
    const m = game.messages.get(id);
    return m?.getFlag(moduleId, "log")?.length ? { total: m.rolls[0].total, advantage: m.rolls[0].hasAdvantage } : null;
  }, { id, moduleId: MODULE_ID }, "Advantage to be recorded");
  assert(after.advantage, "The attack roll was not given advantage.");
  await player.page.waitForTimeout(800);
  const shown = await shownTotals(player, id);
  assert(shown.some(t => t.includes(String(after.total))), `The new total ${after.total} isn't shown. Shown: ${shown.join(" | ")}`);
});

test("compat: a Heavy weapon used from the sheet attacks at disadvantage", async ({ gm, player }) => {
  const id = await giveWeapon(gm, "Greatsword");
  try {
    await forceDice(player, [d20(8), d20(12), [3, 6], [3, 6]]);
    const disadvantage = await attackDisadvantage(player, "Greatsword");
    assert(disadvantage !== null, "No attack was rolled.");
    assert(disadvantage, "The Greatsword's attack, with Strength 10, wasn't made at disadvantage.");
  } finally {
    await takeItem(gm, id);
  }
});

// Midi-QOL applies the Heavy rule itself, and lets an effect excuse a creature from it, which only holds if this module
// leaves Heavy to Midi-QOL.
if ( COMPAT === "midi" ) {
  test("compat: Heavy is left to Midi-QOL, whose effects can excuse a creature from it", async ({ gm, player }) => {
    const id = await giveWeapon(gm, "Greatsword");
    const effect = await gm.eval(async () => (await game.actors.getName("Aria").createEmbeddedDocuments("ActiveEffect", [{
      name: "Mighty Grip", type: "base",
      system: { changes: [{ key: "flags.midi-qol.fail.disadvantage.heavy", type: "override", value: "1", phase: "initial" }] }
    }]))[0].id);
    try {
      // Without the effect, Midi-QOL gives the attack disadvantage, so the effect is shown to be what stops it.
      await forceDice(player, [d20(8), d20(12), [3, 6], [3, 6]]);
      await gm.eval(id => game.actors.getName("Aria").effects.get(id).update({ disabled: true }), effect);
      assertEqual(await attackDisadvantage(player, "Greatsword"), true, "disadvantage without Midi-QOL's flag");
      await gm.eval(id => game.actors.getName("Aria").effects.get(id).update({ disabled: false }), effect);
      await waitFor(player, id => !game.actors.getName("Aria").effects.get(id)?.disabled, effect, "the flag to apply");
      await forceDice(player, [d20(8), d20(12), [3, 6], [3, 6]]);
      assertEqual(await attackDisadvantage(player, "Greatsword"), false, "disadvantage with Midi-QOL's flag");
    } finally {
      await gm.eval(id => game.actors.getName("Aria").effects.get(id)?.delete(), effect);
      await takeItem(gm, id);
    }
  });
}

test("compat: a Reload weapon used from the sheet spends a shot, and isn't fired once empty", async ({ gm, player }) => {
  const id = await giveWeapon(gm, "Dagger", { name: "Pistol", system: { properties: ["rel", "fir"], uses: { max: "1", spent: 0 } } });
  const spent = () => gm.eval(id => game.actors.getName("Aria").items.get(id).system.uses.spent, id);
  try {
    await forceDice(player, [d20(8), [2, 4], [2, 4]]);
    assert(await useDaggerAttack(player, "Pistol"), "No attack roll message was created.");
    await waitFor(gm, id => game.actors.getName("Aria").items.get(id).system.uses.spent === 1, id, "a shot to be spent")
      .catch(() => {});
    assertEqual(await spent(), 1, "shots spent after one attack");

    assertEqual(await useDaggerAttack(player, "Pistol", { rollFromCard: false }), null, "an attack with the Pistol empty");
    const dialog = player.page.locator(".application.dialog", { hasText: "Pistol is out of shots" }).first();
    await dialog.waitFor({ timeout: 10_000 });
    await dialog.locator('button[data-action="no"]').click();
    assertEqual(await spent(), 1, "shots spent after the empty attack");
  } finally {
    await player.eval(async () => {
      for ( const app of foundry.applications.instances.values() ) {
        if ( app.rendered && app.element?.textContent.includes("Pistol is out of shots") ) await app.close();
      }
    });
    await takeItem(gm, id);
  }
});

test("compat: a natural 20 check is ringed in gold", async ({ player }) => {
  await forceDice(player, [d20(20)]);
  const id = await rollAthletics(player);
  const ringed = await player.eval(id => [...document.querySelectorAll(`#chat .chat-log [data-message-id="${id}"] .stt-natural-20`)]
    .filter(el => el.offsetParent !== null).length, id);
  assert(ringed, "The natural 20 has no gold ring.");
});

test("compat: Lucky on a check rerolls it, and the new total is the one shown", async ({ player }) => {
  await forceDice(player, [d20(5)]);
  const id = await rollAthletics(player);
  assert(await visibleCardButtons(player, id), "The check has no visible Hero Card button.");
  await forceDice(player, [d20(15)]);
  await playCardOn(player, id, "Lucky");
  const total = await waitFor(player, ({ id, moduleId }) => {
    const m = game.messages.get(id);
    return m?.getFlag(moduleId, "log")?.length ? m.rolls[0].total : null;
  }, { id, moduleId: MODULE_ID }, "Lucky to be recorded");
  assertEqual(total, 15, "the check's total after Lucky");
  await player.page.waitForTimeout(800);
  const shown = await shownTotals(player, id);
  assert(shown.some(t => t.includes("15")), `The new total isn't shown. Shown: ${shown.join(" | ")}`);
});

test("compat: a requested roll is counted on the request card", async ({ gm, player, ids }) => {
  const id = await postRequest({ gm, player }, { mode: "standard", actors: [ids.aria], parts: [{ type: "skill", key: "ath", dc: 10 }] });
  await forceDice(player, [d20(12)]);
  await player.page.locator(`#chat .chat-log [data-message-id="${id}"] li.stt-request-actor:has(.stt-request-name:text-is("Aria")) .stt-request-roll`).click();
  const normal = player.page.locator(".application.roll-configuration button", { hasText: "Normal" });
  if ( await normal.waitFor({ timeout: 2000 }).then(() => true, () => false) ) await normal.click();
  await waitForCard(gm, id, card => card.rows.find(r => r.name === "Aria")?.results.length > 0, "Aria's result on the card");
});

/**
 * Have the Goblin cast Sacred Flame at Aria through Midi-QOL, every die showing its lowest, and return the damage Aria
 * takes once Midi applies it: the save's d20 shows a 1, and the spell's d8 a 1, whose maximum is 8.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {import("./lib/session.mjs").Session} player
 * @returns {Promise<number>}
 */
async function midiSacredFlame(gm, player) {
  // Whichever client Midi rolls on.
  for ( const session of [gm, player] ) await forceDice(session, Array.from({ length: 8 }, () => d20(1)));
  const token = await gm.eval(async () => {
    const scene = game.scenes.active;
    const aria = game.actors.getName("Aria");
    await aria.update({ "system.attributes.hp": { value: 50, max: 50 } });
    const [token] = await scene.createEmbeddedDocuments("Token", [{ name: "Aria", actorId: aria.id, actorLink: true, x: 300, y: 100 }]);
    const goblin = game.actors.getName("Goblin");
    if ( !goblin.items.getName("Sacred Flame") ) {
      const spell = (await game.packs.get("dnd5e.spells").getDocuments({ name: "Sacred Flame" }))[0];
      await goblin.createEmbeddedDocuments("Item", [game.items.fromCompendium(spell)]);
    }
    const activity = goblin.items.getName("Sacred Flame").system.activities.find(a => a.type === "save");
    await globalThis.MidiQOL.completeActivityUse(activity, {
      midiOptions: { targetUuids: [token.uuid], workflowOptions: { autoFastForward: "on" } }
    });
    return token.uuid;
  });
  try {
    return await waitFor(gm, () => {
      const hp = game.actors.getName("Aria").system.attributes.hp.value;
      return hp < 50 ? 50 - hp : null;
    }, undefined, "Midi to apply the damage", 15_000);
  } finally {
    await gm.eval(async token => {
      await fromUuidSync(token)?.delete().catch(() => {});
      await game.actors.getName("Aria").update({ "system.attributes.hp.value": 50 });
    }, token);
  }
}

test("compat: a natural 1 save against a damaging spell takes the damage's maximum", async ({ gm, player }) => {
  // Midi rolls the save and applies the damage itself; plain dnd5e and RSReforged leave both to the table, which the
  // natural-saves tests already cover, so this one is only run with Midi.
  if ( !(await gm.eval(() => !!game.modules.get("midi-qol")?.active)) ) return;
  assertEqual(await midiSacredFlame(gm, player), 8, "damage taken by a natural 1 save against Sacred Flame's 1d8");
  // With the setting off, the damage is what was rolled.
  await gm.eval(moduleId => game.settings.set(moduleId, "naturalSaves", false), MODULE_ID);
  try {
    assertEqual(await midiSacredFlame(gm, player), 1, "damage taken with the setting off");
  } finally {
    await gm.eval(moduleId => game.settings.set(moduleId, "naturalSaves", true), MODULE_ID);
  }
});

/* -------------------------------------------- */

test("compat: a feature's die, rolled by using the feature, is added to a roll from the right-click menu", async ({ gm, player }) => {
  await gm.eval(async () => {
    const borin = game.actors.getName("Borin");
    if ( borin.items.getName("Bardic Inspiration") ) return;
    await borin.createEmbeddedDocuments("Item", [{ name: "Bardic Inspiration", type: "feat", system: { activities: {
      bardicInspire001: { _id: "bardicInspire001", type: "utility", name: "Inspire",
        roll: { formula: "1d6", name: "Bardic Inspiration", prompt: false, visible: true } }
    } } }]);
  });
  await forceDice(player, [d20(9)]);
  const target = await rollAthletics(player);

  // Used as the sheet uses it. Plain dnd5e then waits for the card's roll button, which is clicked; the other modules
  // roll it with the use.
  await forceDice(player, [[4, 6]]);
  const bonus = await player.eval(async () => {
    const before = new Set(game.messages.keys());
    const activity = game.actors.getName("Borin").items.getName("Bardic Inspiration").system.activities.contents[0];
    const die = () => game.messages.contents.find(m => !before.has(m.id) && m.rolls.length
      && m.rolls.every(r => !(r instanceof CONFIG.Dice.D20Roll) && !(r instanceof CONFIG.Dice.DamageRoll)));
    await activity.use({}, { configure: false }, {});
    for ( let i = 0; (i < 20) && !die(); i++ ) await new Promise(r => setTimeout(r, 100));
    if ( !die() ) await activity.rollFormula({}, { configure: false });
    await new Promise(r => setTimeout(r, 1000));
    return die()?.id ?? null;
  });
  assert(bonus, "The feature's die made no roll.");

  // The message to right-click: the die's own, or the card another module draws it in.
  const shown = await player.eval(id => [...document.querySelectorAll("#chat .chat-log li.chat-message")]
    .find(li => (li.offsetParent !== null) && (li.querySelector(".message-content")?.childElementCount)
      && ((li.dataset.messageId === id) || li.querySelector(`[data-message-id="${id}"]`)))?.dataset.messageId ?? null, bonus);
  assert(shown, "The feature's die isn't shown in chat.");
  await player.page.locator(`#chat .chat-log li.chat-message[data-message-id="${shown}"]`).click({ button: "right" });
  const entry = player.page.locator("#context-menu .context-item", { hasText: "Add to a roll…" });
  await entry.waitFor({ timeout: 5000 }).catch(async () => {
    const entries = await player.page.locator("#context-menu .context-item").allTextContents();
    throw new Error(`"Add to a roll…" is not in the menu: ${entries.map(t => t.trim()).join(", ")}`);
  });
  await entry.click();
  const dialog = player.page.locator(".stt-bonus-dialog.application");
  await dialog.locator(".stt-bonus-choice", { hasText: "Aria" }).first().click({ timeout: 5000 });
  const total = await waitFor(player, ({ id, moduleId }) => {
    const m = game.messages.get(id);
    return m?.getFlag(moduleId, "log")?.length ? m.rolls[0].total : null;
  }, { id: target, moduleId: MODULE_ID }, "the die to be added");
  assertEqual(total, 13, "the check's total after adding the die");
});

test("compat: a natural 1 save takes the damage's maximum when RSReforged's Apply button applies it", async ({ gm, player }) => {
  if ( !(await gm.eval(() => !!game.modules.get("rsreforged")?.active)) ) return;
  const cast = await gm.eval(async () => {
    const scene = game.scenes.active;
    const aria = game.actors.getName("Aria");
    await aria.update({ "system.attributes.hp": { value: 50, max: 50 } });
    const [token] = await scene.createEmbeddedDocuments("Token", [{ name: "Aria", actorId: aria.id, actorLink: true, x: 300, y: 100 }]);
    const goblin = game.actors.getName("Goblin");
    if ( !goblin.items.getName("Sacred Flame") ) {
      const spell = (await game.packs.get("dnd5e.spells").getDocuments({ name: "Sacred Flame" }))[0];
      await goblin.createEmbeddedDocuments("Item", [game.items.fromCompendium(spell)]);
    }
    const activity = goblin.items.getName("Sacred Flame").system.activities.find(a => a.type === "save");
    const targets = [{ actor: aria.uuid, ac: 10, img: token.texture.src, name: "Aria", token: token.uuid }];
    const { message } = await activity.use({}, { configure: false }, { data: { system: { targets } } });
    return { usage: message.id, token: token.uuid };
  });
  await waitFor(player, ({ usage, token }) => !!game.messages.get(usage) && !!fromUuidSync(token), cast, "the spell card");
  await forceDice(player, [d20(1)]);
  await player.eval(async ({ usage, token }) => {
    const card = game.messages.get(usage);
    const document = fromUuidSync(token);
    await document.actor.rollSavingThrow({ ability: "dex", target: 15 }, { configure: false }, {
      data: { speaker: ChatMessage.getSpeaker({ token: document }), system: { ...card.getAssociatedActivity().messageSources, origin: usage } }
    });
  }, cast);
  await forceDice(gm, Array.from({ length: 6 }, () => [2, 8]));
  const hp = await gm.eval(async ({ usage }) => {
    const card = game.messages.get(usage);
    const rolls = await card.getAssociatedActivity().rollDamage({}, { configure: false }, {
      data: { system: { origin: usage, targets: card.system.targets } }
    });
    const damage = rolls[0].parent;
    // An Apply button in the damage's card, handled as RSReforged handles its own: the damage's total, by type, applied
    // to the target with nothing but a multiplier.
    const section = document.createElement("div");
    section.dataset.messageId = damage.id;
    const button = document.createElement("button");
    button.dataset.action = "rsr-apply-damage";
    section.append(button);
    document.body.append(section);
    const aria = game.actors.getName("Aria");
    let applied;
    button.addEventListener("click", () => {
      const damages = dnd5e.dice.aggregateDamageRolls(damage.rolls, { respectProperties: true })
        .map(r => ({ value: r.total, type: r.options.type, properties: new Set(r.options.properties ?? []) }));
      applied = aria.applyDamage(damages, { multiplier: 0.5 });
    });
    button.click();
    await applied;
    section.remove();
    return aria.system.attributes.hp.value;
  }, cast);
  assertEqual(50 - hp, 8, "damage taken by a natural 1 save against Sacred Flame's 1d8 (its maximum, at full)");
  await gm.eval(async token => {
    await fromUuidSync(token)?.delete().catch(() => {});
    await game.actors.getName("Aria").update({ "system.attributes.hp.value": 50 });
  }, cast.token);
});

test("compat: a natural 20 save that Midi-QOL lists on its card is ringed in gold", async ({ gm, player }) => {
  if ( !(await gm.eval(() => !!game.modules.get("midi-qol")?.active)) ) return;
  for ( const session of [gm, player] ) await forceDice(session, Array.from({ length: 8 }, () => d20(20)));
  const token = await gm.eval(async () => {
    const scene = game.scenes.active;
    const aria = game.actors.getName("Aria");
    const [token] = await scene.createEmbeddedDocuments("Token", [{ name: "Aria", actorId: aria.id, actorLink: true, x: 300, y: 100 }]);
    const goblin = game.actors.getName("Goblin");
    if ( !goblin.items.getName("Sacred Flame") ) {
      const spell = (await game.packs.get("dnd5e.spells").getDocuments({ name: "Sacred Flame" }))[0];
      await goblin.createEmbeddedDocuments("Item", [game.items.fromCompendium(spell)]);
    }
    const activity = goblin.items.getName("Sacred Flame").system.activities.find(a => a.type === "save");
    await globalThis.MidiQOL.completeActivityUse(activity, {
      midiOptions: { targetUuids: [token.uuid], workflowOptions: { autoFastForward: "on" } }
    });
    return token.uuid;
  });
  try {
    await waitFor(gm, () => [...document.querySelectorAll("#chat .chat-log .midi-qol-saves-display .midi-qol-save-total")]
      .some(el => el.classList.contains("stt-natural-20") && (el.offsetParent !== null)), undefined,
    "the save's total to be ringed in gold", 15_000);
  } finally {
    await gm.eval(token => fromUuidSync(token)?.delete().catch(() => {}), token);
  }
});

/* -------------------------------------------- */
/*  Carolingian UI                              */
/* -------------------------------------------- */

/**
 * How a user sees parts of a request card: the fonts of its title and of an actor's name, and a Roll button's colours.
 * @param {import("./lib/session.mjs").Session} session
 * @param {string} within  A selector for the element holding the card.
 * @returns {Promise<object|null>}
 */
function requestLook(session, within) {
  return session.eval(within => {
    const card = document.querySelector(`${within} .stt-request`);
    if ( !card ) return null;
    const style = selector => getComputedStyle(card.querySelector(selector));
    const roll = style(".stt-request-roll");
    return {
      title: style(".stt-request-header h3").fontFamily,
      name: style(".stt-request-name").fontFamily,
      roll: [roll.fontFamily, roll.backgroundColor, roll.borderTopColor, roll.color].join(" / ")
    };
  }, within);
}

test("compat: a request card in chat is drawn like its pop-up, in the module's own theme", async ({ gm, player, ids }) => {
  // Another module's chat styles reach the card in chat, but not the pop-up, which is a window.
  await gm.eval(moduleId => game.settings.set(moduleId, "popupPlayers", true), MODULE_ID);
  await waitFor(player, moduleId => game.settings.get(moduleId, "popupPlayers"), MODULE_ID, "the pop-up setting");
  const id = await postRequest({ gm, player }, { mode: "standard", actors: [ids.aria], parts: [{ type: "skill", key: "ath", dc: 10 }] });
  await player.page.locator(".stt-request-popup .stt-request-roll").first().waitFor({ timeout: 10_000 });
  const chat = await requestLook(player, `#chat .chat-log [data-message-id="${id}"]`);
  const popup = await requestLook(player, ".stt-request-popup");
  assert(chat.title.includes("Cinzel"), `The card's title is in ${chat.title}.`);
  assert(chat.name.includes("Spectral"), `An actor's name is in ${chat.name}.`);
  assertEqual(chat.title, popup.title, "the title's font, in chat as in the pop-up");
  assertEqual(chat.name, popup.name, "a name's font, in chat as in the pop-up");
  assertEqual(chat.roll, popup.roll, "the Roll button, in chat as in the pop-up");
});

test("compat: Carolingian UI's compact cards hold a roll's Hero Card button beside the row's title", async ({ gm, player }) => {
  if ( !(await gm.eval(() => !!globalThis.dnd5eCompactCards?.isActive)) ) return;
  await forceDice(player, [d20(8), [2, 4]]);
  const rolls = await player.eval(async () => {
    const activity = game.actors.getName("Aria").items.getName("Dagger").system.activities.find(a => a.type === "attack");
    const { message } = await activity.use({}, { configure: false }, {});
    const data = { system: { origin: message.id } };
    const [attack] = await activity.rollAttack({}, { configure: false }, { data });
    const [damage] = await activity.rollDamage({}, { configure: false }, { data });
    return { card: message.id, attack: attack.parent.id, damage: damage.parent.id };
  });
  for ( const id of [rolls.attack, rolls.damage] ) {
    const button = await waitFor(player, ({ card, id }) => {
      const summary = document.querySelector(`#chat .chat-log [data-message-id="${card}"] .card-summary[data-message-id="${id}"]`);
      const button = summary?.querySelector(".stt-card-button");
      if ( !button || !summary.querySelector(".dcc-roll-row .dice-roll") ) return null;
      const inside = (a, b) => (a.left >= b.left - 1) && (a.right <= b.right + 1) && (a.top >= b.top - 1) && (a.bottom <= b.bottom + 1);
      return {
        parent: button.parentElement.className,
        inside: inside(button.getBoundingClientRect(), summary.getBoundingClientRect()),
        rowHeight: summary.querySelector(".dcc-roll-row").offsetHeight
      };
    }, { card: rolls.card, id }, "the roll's row and its Hero Card button");
    assertEqual(button.parent, "dcc-row-title", "where the button is");
    assert(button.inside, "The button is drawn outside its row.");
    assert(button.rowHeight < 40, `The row has wrapped onto a second line: it is ${button.rowHeight}px tall.`);
  }
  // The button plays a card on the roll its row shows.
  await forceDice(player, [d20(17)]);
  await playCardOn(player, rolls.attack, "Advantage");
  await waitFor(player, ({ id, moduleId }) => !!game.messages.get(id)?.getFlag(moduleId, "log")?.length,
    { id: rolls.attack, moduleId: MODULE_ID }, "Advantage to be recorded");
  await player.page.waitForTimeout(800);
  const shown = await shownTotals(player, rolls.attack);
  assert(shown.some(t => t.includes("17")), `The new total isn't shown. Shown: ${shown.join(" | ")}`);
});

test("compat: advantage Carolingian UI gives a roll afterwards is counted on the request card", async ({ gm, player, ids }) => {
  if ( !(await gm.eval(() => !!globalThis.dnd5eCompactCards?.active?.setAdvantageMode)) ) return;
  const id = await postRequest({ gm, player }, { mode: "standard", actors: [ids.aria], parts: [{ type: "skill", key: "ath", dc: 15 }] });
  await forceDice(player, [d20(4)]);
  await player.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-request-roll`).first().click({ modifiers: ["Shift"] });
  const roll = await waitForRoll(player, id, ids.aria);
  await waitForCard(gm, id, card => card.rows[0]?.results[0]?.text === "4", "Aria's 4 on the card");
  await forceDice(player, [d20(18)]);
  await player.eval(roll => globalThis.dnd5eCompactCards.active.setAdvantageMode(game.messages.get(roll),
    CONFIG.Dice.D20Roll.ADV_MODE.ADVANTAGE), roll.id);
  for ( const session of [gm, player] ) {
    await waitForCard(session, id, card => card.rows[0]?.results[0]?.text === "18", "the new total on the card");
  }
});

test("compat: a card played after Carolingian UI changed a roll's advantage works on the dice it kept", async ({ gm, player }) => {
  if ( !(await gm.eval(() => !!globalThis.dnd5eCompactCards?.active?.setAdvantageMode)) ) return;
  await forceDice(player, [d20(12)]);
  const id = await rollAthletics(player);
  await forceDice(player, [d20(5)]);
  await player.eval(id => globalThis.dnd5eCompactCards.active.setAdvantageMode(game.messages.get(id),
    CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE), id);
  await waitFor(player, id => game.messages.get(id).rolls[0].total === 5, id, "disadvantage to keep the 5");
  await player.page.waitForTimeout(800);
  assert(await visibleCardButtons(player, id), "The check has no visible Hero Card button.");
  await forceDice(player, [d20(16)]);
  await playCardOn(player, id, "Lucky");
  const roll = await waitFor(player, ({ id, moduleId }) => {
    const m = game.messages.get(id);
    return m?.getFlag(moduleId, "log")?.length ? { total: m.rolls[0].total, disadvantage: m.rolls[0].hasDisadvantage } : null;
  }, { id, moduleId: MODULE_ID }, "Lucky to be recorded");
  assert(roll.disadvantage, "The roll lost the disadvantage it was given.");
  await player.page.waitForTimeout(800);
  const shown = await shownTotals(player, id);
  assert(shown.some(t => t.includes(String(roll.total))), `The new total ${roll.total} isn't shown. Shown: ${shown.join(" | ")}`);
});

test("compat: Chat Button Labels stay off while Carolingian UI is enabled, and keep what was saved", async ({ gm }) => {
  if ( !(await gm.eval(() => !!game.modules.get("crlngn-ui")?.active)) ) return;
  await gm.eval(moduleId => game.settings.set(moduleId, "chatButtonLabels", true), MODULE_ID);
  try {
    assert(!(await gm.eval(() => document.body.classList.contains("stt-chat-button-labels"))),
      "The labels are on, beside the labels Carolingian UI writes.");
    await gm.eval(moduleId => new (game.settings.menus.get(`${moduleId}.worldScripts`).type)().render({ force: true }),
      MODULE_ID);
    const menu = gm.page.locator("#stt-settings-world-scripts");
    const box = menu.locator('input[name="chatButtonLabels"]');
    await box.waitFor({ timeout: 10_000 });
    assert(await box.isDisabled(), "The setting can be changed.");
    assert(!(await box.isChecked()), "The setting is shown switched on.");
    const hint = await menu.locator('.form-group:has(input[name="chatButtonLabels"]) .hint').textContent();
    assert(hint.includes("Carolingian UI"), `The setting's hint doesn't say why: ${hint}`);
    await menu.locator('button[type="submit"]').click();
    await menu.waitFor({ state: "detached", timeout: 5000 });
    assertEqual(await gm.eval(moduleId => game.settings.get(moduleId, "chatButtonLabels"), MODULE_ID), true,
      "the saved setting, after saving the menu");
  } finally {
    await gm.eval(moduleId => game.settings.set(moduleId, "chatButtonLabels", false), MODULE_ID);
  }
});
