/**
 * End-to-end tests for natural 1s and 20s on saves against a spell's damage: a natural 20 takes no damage, and a
 * natural 1 takes the damage's maximum, every die at its highest, ignoring resistances and immunities.
 *
 * The Goblin casts Sacred Flame at Aria and Borin, who have tokens on the scene for these tests. The player rolls their
 * saves against the spell's card, as its Save button does, and the GM rolls its damage as the Damage button does. What
 * each target takes is read from dnd5e's damage tray, then applied through it.
 *
 * Natural 1s and 20s on all saves is turned off for these tests, so a save is passed or failed by its total, and only
 * this rule changes the damage.
 */

import { MODULE_ID } from "./config.mjs";
import { assertEqual, forceDice, test, waitFor } from "./lib/harness.mjs";

const d20 = n => [n, 20];

/** RSReforged applies damage from Apply buttons of its own instead of dnd5e's tray; the compatibility tests cover those. */
const NO_TRAY = "RSReforged has no damage tray; see the compatibility tests.";
const d8 = n => [n, 8];

/**
 * Put Aria and Borin on the scene with 50 hit points, give Aria a defence against radiant damage, and have the Goblin
 * cast Sacred Flame at them.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {import("./lib/session.mjs").Session} player
 * @param {"dr"|"di"} defence  Whether Aria resists radiant damage or is immune to it.
 * @returns {Promise<{ usage: string, aria: string, borin: string }>}  The spell card's ID, and the targets' token UUIDs.
 */
async function castAtAriaAndBorin(gm, player, defence = "dr") {
  await gm.eval(moduleId => game.settings.set(moduleId, "naturalSaveOutcomes", false), MODULE_ID);
  const cast = await gm.eval(async defence => {
    const scene = game.scenes.active;
    const tokens = {};
    for ( const [name, x] of [["Aria", 300], ["Borin", 500]] ) {
      const actor = game.actors.getName(name);
      await actor.update({
        "system.attributes.hp": { value: 50, max: 50 },
        [`system.traits.${defence}.value`]: name === "Aria" ? ["radiant"] : []
      });
      const [token] = await scene.createEmbeddedDocuments("Token", [{ name, actorId: actor.id, actorLink: true, x, y: 100 }]);
      tokens[name] = token;
    }
    const goblin = game.actors.getName("Goblin");
    if ( !goblin.items.getName("Sacred Flame") ) {
      const spell = (await game.packs.get("dnd5e.spells").getDocuments({ name: "Sacred Flame" }))[0];
      await goblin.createEmbeddedDocuments("Item", [game.items.fromCompendium(spell)]);
    }
    const activity = goblin.items.getName("Sacred Flame").system.activities.find(a => a.type === "save");
    const targets = Object.values(tokens).map(t => ({ actor: t.actor.uuid, ac: 10, img: t.texture.src, name: t.name, token: t.uuid }));
    const { message } = await activity.use({}, { configure: false }, { data: { system: { targets } } });
    return { usage: message.id, aria: tokens.Aria.uuid, borin: tokens.Borin.uuid };
  }, defence);
  await waitFor(player, ({ usage, aria, borin }) => !!game.messages.get(usage) && !!fromUuidSync(aria) && !!fromUuidSync(borin),
    cast, "the spell card and tokens to reach the player");
  return cast;
}

/**
 * Take Aria's and Borin's tokens off the scene and put them back as they were.
 * @param {import("./lib/session.mjs").Session} gm
 */
async function cleanUp(gm) {
  await gm.eval(async moduleId => {
    const scene = game.scenes.active;
    // With the canvas off, Foundry throws once the tokens are deleted, but they are gone from the server by then.
    await scene.deleteEmbeddedDocuments("Token", scene.tokens.filter(t => t.name !== "Goblin").map(t => t.id)).catch(() => {});
    for ( const name of ["Aria", "Borin"] ) {
      await game.actors.getName(name).update({ "system.traits.dr.value": [], "system.traits.di.value": [] });
    }
    for ( const key of ["naturalSaves", "naturalSaveOutcomes"] ) {
      if ( !game.settings.get(moduleId, key) ) await game.settings.set(moduleId, key, true);
    }
  }, MODULE_ID);
}

/**
 * Roll a save against the spell's card as the player, from the creature's token, and wait for the GM to see it.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {import("./lib/session.mjs").Session} player
 * @param {string} usage  The spell card's ID.
 * @param {string} token  The token's UUID.
 * @param {number} natural
 * @param {number} [dc]
 */
async function rollSave(gm, player, usage, token, natural, dc = 15) {
  await forceDice(player, [d20(natural)]);
  const id = await player.eval(async ({ usage, token, dc }) => {
    const card = game.messages.get(usage);
    const activity = card.getAssociatedActivity();
    const document = fromUuidSync(token);
    const [roll] = await document.actor.rollSavingThrow({ ability: "dex", target: dc }, { configure: false }, {
      data: { speaker: ChatMessage.getSpeaker({ token: document }), system: { ...activity.messageSources, origin: usage } }
    });
    return roll.parent.id;
  }, { usage, token, dc });
  await waitFor(gm, id => !!game.messages.get(id), id, "the save to reach the GM");
  const shown = await gm.eval(id => game.messages.get(id).rolls[0].d20.results.find(r => r.active).result, id);
  assertEqual(shown, natural, "the save's natural");
}

/**
 * Roll the spell's damage as the GM, as the card's Damage button does, every d8 showing 2.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {string} usage
 * @returns {Promise<{ id: string, total: number, maximum: number }>}  The damage message's ID, its total, and its
 *                                                                     total with every die at its highest.
 */
async function rollDamage(gm, usage) {
  await forceDice(gm, Array.from({ length: 12 }, () => d8(2)));
  return gm.eval(async usage => {
    const card = game.messages.get(usage);
    const rolls = await card.getAssociatedActivity().rollDamage({}, { configure: false }, {
      data: { system: { origin: usage, targets: card.system.targets } }
    });
    const dice = rolls.flatMap(r => r.dice);
    const total = rolls.reduce((t, r) => t + r.total, 0);
    const maximum = total + dice.reduce((t, d) => t + (d.number * d.faces) - d.total, 0);
    return { id: rolls[0].parent.id, total, maximum };
  }, usage);
}

/**
 * What the damage tray of a damage message would do to each target, as the GM sees it. The harness runs with the canvas
 * off, so dnd5e can't list the tray's targets by token, which is how it lists them on the scene being viewed; the
 * tray is asked about each token instead.
 * @param {import("./lib/session.mjs").Session} session
 * @param {string} id  The damage message's ID.
 * @param {string[]} tokens  The targets' token UUIDs.
 * @returns {Promise<Record<string, { damage: number, ignoring: string[] }>>}  Keyed by target name. `ignoring` lists
 *                                                                             each ignored defence as "change:type".
 */
async function tray(session, id, tokens) {
  const selector = `#chat .chat-log [data-message-id="${id}"] damage-application`;
  await session.page.locator(selector).first().waitFor({ state: "attached", timeout: 10_000 });
  return session.page.locator(selector).first().evaluate((el, tokens) => Object.fromEntries(tokens.map(uuid => {
    const token = fromUuidSync(uuid);
    const options = el.getMergedOptions(uuid);
    const ignoring = ["resistance", "immunity"].flatMap(c => [...(options.ignore?.[c] ?? [])].map(t => `${c}:${t}`));
    return [token.name, { damage: el.calculateDamage(token.actor, options).total, ignoring }];
  })), tokens);
}

/**
 * Apply a damage message's tray to these targets as the GM, as its Apply button does.
 * @param {import("./lib/session.mjs").Session} session
 * @param {string} id
 * @param {string[]} tokens  The targets' token UUIDs.
 */
async function apply(session, id, tokens) {
  await session.page.locator(`#chat .chat-log [data-message-id="${id}"] damage-application`).first().evaluate(async (el, tokens) => {
    for ( const uuid of tokens ) {
      await fromUuidSync(uuid).actor.applyDamage(el.damages, { ...el.getMergedOptions(uuid), isDelta: true, origin: el.chatMessage });
    }
  }, tokens);
}

/**
 * @param {import("./lib/session.mjs").Session} session
 * @returns {Promise<{ Aria: number, Borin: number }>}  Their hit points.
 */
function hitPoints(session) {
  return session.eval(() => Object.fromEntries(["Aria", "Borin"].map(n => [n, game.actors.getName(n).system.attributes.hp.value])));
}

/**
 * @param {import("./lib/session.mjs").Session} session
 * @param {string} usage
 * @returns {Promise<number>}  How many damage rolls the spell's card has.
 */
function damageRolls(session, usage) {
  return session.eval(usage => game.messages.get(usage).getAssociatedRolls("damage").length, usage);
}

test("natural saves: a natural 1 takes maximum damage past resistance, and a natural 20 takes none", async ({ gm, player }) => {
  try {
    const { usage, aria, borin } = await castAtAriaAndBorin(gm, player);
    // Aria's 1 beats DC 1 and Borin's 20 misses DC 25, so only the naturals decide their damage.
    await rollSave(gm, player, usage, aria, 1, 1);
    await rollSave(gm, player, usage, borin, 20, 25);
    const { id, total, maximum } = await rollDamage(gm, usage);
    assertEqual(total < maximum, true, `the roll (${total}) below its maximum (${maximum})`);

    assertEqual(await tray(gm, id, [aria, borin]), {
      Aria: { damage: maximum, ignoring: ["resistance:radiant"] }, Borin: { damage: 0, ignoring: [] }
    }, "the tray");
    await apply(gm, id, [aria, borin]);
    assertEqual(await hitPoints(gm), { Aria: 50 - maximum, Borin: 50 }, "hit points once the tray is applied");
    await gm.page.waitForTimeout(300);
    assertEqual(await damageRolls(gm, usage), 1, "damage rolls on the card: no second roll");
  } finally {
    await cleanUp(gm);
  }
}, { skip: { rsr: NO_TRAY } });

test("natural saves: a natural 1 takes maximum damage past immunity", async ({ gm, player }) => {
  try {
    const { usage, aria, borin } = await castAtAriaAndBorin(gm, player, "di");
    await rollSave(gm, player, usage, aria, 1);
    await rollSave(gm, player, usage, borin, 9);
    const { id, total, maximum } = await rollDamage(gm, usage);
    assertEqual(await tray(gm, id, [aria, borin]), {
      Aria: { damage: maximum, ignoring: ["immunity:radiant"] }, Borin: { damage: total, ignoring: [] }
    }, "the tray, Borin failing with a 9");
  } finally {
    await cleanUp(gm);
  }
}, { skip: { rsr: NO_TRAY } });

test("natural saves: a natural 1 rolled after the damage takes its maximum too", async ({ gm, player }) => {
  try {
    const { usage, aria } = await castAtAriaAndBorin(gm, player);
    const { id, total, maximum } = await rollDamage(gm, usage);
    assertEqual(await tray(gm, id, [aria]), { Aria: { damage: Math.trunc(total / 2), ignoring: [] } },
      "the tray before Aria's save, her resistance halving it");
    await rollSave(gm, player, usage, aria, 1);
    await waitFor(gm, ({ id, aria, maximum }) => {
      const el = document.querySelector(`#chat .chat-log [data-message-id="${id}"] damage-application`);
      return el?.calculateDamage(fromUuidSync(aria).actor, el.getMergedOptions(aria)).total === maximum;
    }, { id, aria, maximum }, "the tray to give Aria the maximum");
  } finally {
    await cleanUp(gm);
  }
}, { skip: { rsr: NO_TRAY } });

test("natural saves: with the setting off, a natural 1 or 20 changes no damage", async ({ gm, player }) => {
  try {
    const setting = await gm.eval(moduleId => {
      const s = game.settings.settings.get(`${moduleId}.naturalSaves`);
      return { config: s?.config, scope: s?.scope, default: s?.default };
    }, MODULE_ID);
    assertEqual(setting, { config: false, scope: "world", default: true }, "the setting");
    await gm.eval(moduleId => game.settings.set(moduleId, "naturalSaves", false), MODULE_ID);
    await waitFor(player, moduleId => game.settings.get(moduleId, "naturalSaves") === false, MODULE_ID,
      "the setting to reach the player");

    const { usage, aria, borin } = await castAtAriaAndBorin(gm, player);
    await rollSave(gm, player, usage, aria, 1);
    await rollSave(gm, player, usage, borin, 20, 25);
    const { id, total } = await rollDamage(gm, usage);
    assertEqual(await tray(gm, id, [aria, borin]), {
      Aria: { damage: Math.trunc(total / 2), ignoring: [] }, Borin: { damage: total, ignoring: [] }
    }, "the tray with the setting off");
  } finally {
    await cleanUp(gm);
  }
}, { skip: { rsr: NO_TRAY } });
