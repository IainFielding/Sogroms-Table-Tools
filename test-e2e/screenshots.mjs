/**
 * Take the screenshots in docs/images for the user guides, from a real Foundry.
 *
 *   npm run docs:screenshots              # every screenshot
 *   npm run docs:screenshots -- divine    # only screenshots whose name contains "divine"
 *
 * Uses the end-to-end harness: the same Foundry, test world and fixtures (see README.md), with portraits added so the
 * pictures look like a table in play. Dice are forced, so every run takes the same pictures.
 */

import fs from "node:fs";
import path from "node:path";
import { GM_USER, MODULE_ID, PLAYER_USER, WORLD } from "./config.mjs";
import { clickRoll, forceDice, postRequest, waitFor, waitForCard, waitForRoll } from "./lib/harness.mjs";
import { startFoundry } from "./lib/server.mjs";
import { Session } from "./lib/session.mjs";
import { enableModules, ensureWorld, resetFixtures, resetWorld } from "./lib/world.mjs";

const OUT = "docs/images";

const d20 = n => [n, 20];
const d6 = n => [n, 6];
const d8 = n => [n, 8];
const d100 = n => [n, 100];
const athletics = dc => ({ type: "skill", key: "ath", dc });

/** @type {{ name: string, fn: Function }[]} */
const shots = [];

/**
 * Register a screenshot, or a group of them taken from one scene.
 * @param {string} name
 * @param {(ctx: object) => Promise<void>} fn
 */
function shot(name, fn) {
  shots.push({ name, fn });
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * Save the part of a user's screen covering every target, with a margin.
 * @param {Session} session
 * @param {string} name  File name in docs/images, without the extension.
 * @param {import("playwright").Locator|import("playwright").Locator[]} targets
 * @param {object} [options]
 * @param {number} [options.pad=8]
 */
async function capture(session, name, targets, { pad = 8 } = {}) {
  const { page } = session;
  await page.mouse.move(2, 2);
  // A tooltip from the last click would cover what is being shown.
  await session.eval(() => game.tooltip.deactivate());
  await page.waitForTimeout(400);
  const boxes = [];
  for ( const target of [targets].flat() ) {
    const box = await target.first().boundingBox();
    if ( !box ) throw new Error(`${name}: a target isn't on screen.`);
    boxes.push(box);
  }
  const viewport = page.viewportSize();
  const x = Math.max(0, Math.min(...boxes.map(b => b.x)) - pad);
  const y = Math.max(0, Math.min(...boxes.map(b => b.y)) - pad);
  const right = Math.min(viewport.width, Math.max(...boxes.map(b => b.x + b.width)) + pad);
  const bottom = Math.min(viewport.height, Math.max(...boxes.map(b => b.y + b.height)) + pad);
  const png = await page.screenshot({ clip: { x, y, width: right - x, height: bottom - y } });
  fs.writeFileSync(path.join(OUT, `${name}.webp`), await toWebP(page, png));
  console.log(`  saved ${name}.webp`);
}

/**
 * Re-encode a screenshot as WebP, a fifth of the size of PNG with no visible loss. Chromium's canvas does the encoding,
 * so the harness needs no image library.
 * @param {import("playwright").Page} page
 * @param {Buffer} png
 * @returns {Promise<Buffer>}
 */
async function toWebP(page, png) {
  const webp = await page.evaluate(async base64 => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    return canvas.toDataURL("image/webp", 0.9).split(",")[1];
  }, png.toString("base64"));
  return Buffer.from(webp, "base64");
}

/**
 * @param {Session} session
 * @param {string} id
 * @returns {import("playwright").Locator}  A chat message, in the user's chat sidebar.
 */
function message(session, id) {
  return session.page.locator(`#chat .chat-log li.chat-message[data-message-id="${id}"]`);
}

/**
 * Make a roll in a user's browser, fast-forwarded, and return its chat message's ID once it has rendered.
 * @param {Session} session
 * @param {string} actor  The actor's name.
 * @param {"skill"|"save"|"attack"|"damage"|"bardic"} kind
 * @param {object} [config]  Extra roll configuration, such as `{ target: 15 }`.
 * @returns {Promise<string>}
 */
async function roll(session, actor, kind, config = {}) {
  const id = await session.eval(async ({ actor: name, kind, config }) => {
    const actor = game.actors.getName(name);
    const before = new Set(game.messages.keys());
    const fast = { configure: false };
    const attack = () => actor.items.getName("Dagger").system.activities.find(a => a.type === "attack");
    switch ( kind ) {
      case "skill": await actor.rollSkill({ skill: "ath", ...config }, fast); break;
      case "save": await actor.rollSavingThrow({ ability: "con", ...config }, fast); break;
      case "attack": await attack().rollAttack({ ...config }, fast); break;
      case "damage": await attack().rollDamage({ ...config }, fast); break;
      case "bardic":
        // Spoken by the bard: dnd5e would otherwise speak as the user's own character.
        await actor.items.getName("Bardic Inspiration").system.activities.contents[0].rollFormula({}, fast, {
          data: { speaker: ChatMessage.getSpeaker({ actor }) }
        });
        break;
    }
    await new Promise(r => setTimeout(r, 300));
    return game.messages.contents.find(m => !before.has(m.id) && m.rolls.length)?.id ?? null;
  }, { actor, kind, config });
  if ( !id ) throw new Error(`No ${kind} roll message was created for ${actor}.`);
  await message(session, id).waitFor({ timeout: 10_000 });
  await message(session, id).scrollIntoViewIfNeeded();
  return id;
}

/**
 * Set a module setting as the GM, and wait for the player to see it.
 * @param {object} ctx
 * @param {string} key
 * @param {*} value
 */
async function setSetting({ gm, player }, key, value) {
  await gm.eval(({ moduleId, key, value }) => game.settings.set(moduleId, key, value), { moduleId: MODULE_ID, key, value });
  await waitFor(player, ({ moduleId, key, value }) => game.settings.get(moduleId, key) === value,
    { moduleId: MODULE_ID, key, value }, `${key} to reach the player`);
}

/**
 * Open the request window from the chat controls, as the GM would.
 * @param {Session} gm
 * @param {string} [mode]
 * @returns {Promise<import("playwright").Locator>}
 */
async function openWindow(gm, mode) {
  await gm.page.locator("#chat-controls .stt-request-control").click();
  const app = gm.page.locator("#stt-roll-request");
  await app.waitFor({ timeout: 10_000 });
  if ( mode ) {
    await app.locator(`.stt-request-mode:has(input[value="${mode}"])`).click();
    await app.locator(`.stt-request-mode:has(input[value="${mode}"]:checked)`).waitFor({ timeout: 5000 });
    await gm.page.waitForTimeout(300);
  }
  return app;
}

/**
 * Open the Hero Card chooser from a roll's card button.
 * @param {Session} session
 * @param {import("playwright").Locator} scope  The chat message, or the row of a request card.
 * @returns {Promise<import("playwright").Locator>}  The chooser.
 */
async function openChooser(session, scope) {
  await scope.locator(".stt-card-button:visible").first().click();
  const dialog = session.page.locator(".stt-card-dialog.application").last();
  await dialog.locator(".stt-card-choice").first().waitFor({ timeout: 10_000 });
  // The card art is loaded as the chooser opens.
  await session.page.waitForTimeout(800);
  return dialog;
}

/**
 * Wait until the played card's art has left the screen, so it isn't in the next picture.
 * @param {Session} session
 */
async function waitForPlayedCard(session) {
  await session.page.locator(".stt-played-card-entry").first().waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => {});
}

/**
 * Give Borin nine Fighter levels and dnd5e's 2024 Indomitable, and a Bardic Inspiration feature that rolls 1d6, as the
 * end-to-end tests do.
 * @param {Session} gm
 */
function equipBorin(gm) {
  return gm.eval(async () => {
    const borin = game.actors.getName("Borin");
    if ( borin.items.getName("Indomitable") ) return;
    const fighter = (await game.packs.get("dnd5e.classes24").getDocuments({ name: "Fighter", type: "class" }))[0];
    const fighterData = game.items.fromCompendium(fighter);
    fighterData.system.levels = 9;
    const indomitable = game.items.fromCompendium(await fromUuid("Compendium.dnd5e.classes24.Item.phbftrIndomitabl"));
    foundry.utils.setProperty(indomitable, "system.uses", { max: "2", spent: 0 });
    await borin.createEmbeddedDocuments("Item", [fighterData, indomitable, {
      name: "Bardic Inspiration",
      type: "feat",
      img: "icons/skills/melee/unarmed-punch-fist.webp",
      system: {
        activities: {
          bardicInspire001: {
            _id: "bardicInspire001", type: "utility", name: "Inspire",
            roll: { formula: "1d6", name: "Bardic Inspiration", prompt: false, visible: true }
          }
        }
      }
    }]);
  });
}

/* -------------------------------------------- */
/*  Player Guide                                */
/* -------------------------------------------- */

shot("card window from the sheet, played card, and its chat record", async ({ player }) => {
  // Item#use is wrapped to open the card window, which waits for a choice, so it isn't awaited here.
  await player.eval(() => {
    game.actors.getName("Aria").items.getName("Hero Cards").use();
  });
  const dialog = player.page.locator(".stt-card-dialog.application").last();
  await dialog.locator(".stt-card-choice").first().waitFor({ timeout: 10_000 });
  await player.page.waitForTimeout(1000);
  await capture(player, "card-window", dialog);
  // The module's image on Foundry's setup screen, named in module.json, is shipped with the module.
  fs.copyFileSync(path.join(OUT, "card-window.webp"), "assets/card-window.webp");

  await dialog.locator(".stt-card-choice", { hasText: "Relentless" }).first().click();
  // dnd5e may ask how to use the activity: accept its defaults.
  const usage = player.page.locator(".application.activity-usage button[data-action=use]");
  if ( await usage.waitFor({ timeout: 2000 }).then(() => true, () => false) ) await usage.click();
  const overlay = player.page.locator("#stt-played-card .stt-played-card-entry").first();
  await overlay.waitFor({ timeout: 10_000 });
  await player.page.waitForTimeout(700);
  await capture(player, "played-card", overlay, { pad: 24 });

  const id = await waitFor(player, () => game.messages.contents.findLast(m => m.type === "usage")?.id ?? null, null,
    "the card's chat record");
  await waitForPlayedCard(player);
  await capture(player, "card-chat-record", message(player, id));
});

shot("a card played on a roll already in chat", async ({ player }) => {
  await forceDice(player, [d20(9)]);
  const id = await roll(player, "Aria", "skill", { target: 15 });
  await capture(player, "roll-card-button", message(player, id));

  const dialog = await openChooser(player, message(player, id));
  await capture(player, "card-chooser", dialog);

  await forceDice(player, [d8(7)]);
  await dialog.locator('.stt-card-choice[data-card="Inspiration - 1d8"]').first().click();
  await waitFor(player, id => !!document.querySelector(`#chat [data-message-id="${id}"] .stt-card-log`), id,
    "the card's note on the roll");
  await waitForPlayedCard(player);
  await capture(player, "card-played-on-roll", message(player, id));
});

shot("natural 20 and natural 1", async ({ player }) => {
  await forceDice(player, [d20(20)]);
  const twenty = await roll(player, "Aria", "skill");
  await forceDice(player, [d20(1)]);
  const one = await roll(player, "Aria", "skill");
  await capture(player, "naturals", [message(player, twenty), message(player, one)]);
});

shot("natural 20 and natural 1 on initiative", async ({ gm, player }) => {
  await gm.eval(async () => {
    const combat = await Combat.create({ active: true });
    await combat.createEmbeddedDocuments("Combatant",
      ["Aria", "Borin", "Goblin"].map(name => ({ actorId: game.actors.getName(name).id })));
    await combat.activate();
  });
  await waitFor(player, () => game.combat?.combatants.size === 3, null, "the combat to reach the player");
  const rollFor = async (session, name, natural) => {
    await forceDice(session, [d20(natural)]);
    await session.eval(name => game.combat.rollInitiative([game.combat.combatants.getName(name).id]), name);
  };
  await rollFor(player, "Aria", 20);
  await rollFor(gm, "Goblin", 1);
  // Typed in, so one total sits above the natural 20's and below nothing: the naturals alone decide first and last.
  await gm.eval(() => game.combat.combatants.getName("Borin").update({ initiative: 27 }));
  await waitFor(player, () => game.combat.turns.map(c => c.name).join() === "Aria,Borin,Goblin", null,
    "the initiative order to reach the player");
  try {
    await player.eval(() => ui.sidebar.changeTab("combat", "primary"));
    const tracker = player.page.locator("#combat .combat-tracker");
    await tracker.locator(".token-initiative.stt-natural-1").waitFor({ timeout: 10_000 });
    // Its rows alone: the tracker is as tall as the sidebar, and empty below them.
    await capture(player, "initiative-naturals", [tracker.locator(".combatant").first(), tracker.locator(".combatant").last()]);
  } finally {
    await player.eval(() => ui.sidebar.changeTab("chat", "primary"));
  }
});

shot("adding another feature's die to a roll", async (ctx) => {
  const { gm, player } = ctx;
  await equipBorin(gm);
  await forceDice(player, [d20(11)]);
  const target = await roll(player, "Aria", "skill", { target: 15 });
  await forceDice(player, [d6(5)]);
  const bonus = await roll(player, "Borin", "bardic");

  await message(player, bonus).click({ button: "right" });
  const menu = player.page.locator("#context-menu");
  await menu.waitFor({ timeout: 5000 });
  await player.page.waitForTimeout(300);
  await capture(player, "bonus-menu", [message(player, bonus), menu]);

  await menu.locator(".context-item", { hasText: "Add to a roll" }).click();
  const dialog = player.page.locator(".stt-bonus-dialog.application");
  await dialog.locator(".stt-bonus-choice").first().waitFor({ timeout: 5000 });
  await capture(player, "bonus-chooser", dialog);

  await dialog.locator(".stt-bonus-choice").first().click();
  await waitFor(player, id => !!document.querySelector(`#chat [data-message-id="${id}"] .stt-card-log`), target,
    "the bonus note on the roll");
  await capture(player, "bonus-applied", [message(player, target), message(player, bonus)]);
});

shot("Fighter's Indomitable on a failed save", async ({ gm, player }) => {
  await equipBorin(gm);
  await forceDice(player, [d20(6)]);
  const id = await roll(player, "Borin", "save", { target: 15 });
  await message(player, id).locator(".stt-feature-button").waitFor({ timeout: 10_000 });
  await capture(player, "indomitable-button", message(player, id));

  await forceDice(player, [d20(8)]);
  await message(player, id).locator(".stt-feature-button").click();
  await waitFor(player, id => !!document.querySelector(`#chat [data-message-id="${id}"] .stt-card-log`), id,
    "Indomitable's note on the save");
  await capture(player, "indomitable-used", message(player, id));
});

shot("a roll request, as a player sees it", async (ctx) => {
  const { player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "standard", parts: [athletics(15)], actors: [ids.aria, ids.borin], showDC: true
  });
  await forceDice(player, [d20(17)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await waitForCard(player, id, c => c.rows[0].results.length, "Aria's result");
  await capture(player, "request-player", message(player, id));
});

shot("choosing which roll to make", async (ctx) => {
  const { player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "standard", actors: [ids.aria], showDC: true,
    parts: [{ ...athletics(15), alternatives: [{ type: "skill", key: "acr", dc: 10 }] }]
  });
  await message(player, id).locator(".stt-request-roll").first().click();
  const dialog = player.page.locator(".stt-choice-dialog.application");
  await dialog.waitFor({ timeout: 10_000 });
  // Beside the card it was opened from, rather than wherever Foundry put it.
  const card = await message(player, id).boundingBox();
  await player.eval(({ left, top }) => {
    const app = [...foundry.applications.instances.values()].find(a => a.element?.classList.contains("stt-choice-dialog"));
    app.setPosition({ left, top });
  }, { left: card.x - 340, top: card.y });
  await capture(player, "choice-dialog", [message(player, id), dialog]);
  await dialog.locator('[data-action="close"]').click();
});

shot("picking Divine Intervention's numbers", async (ctx) => {
  const { player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "divine", range: 16, parts: [{ type: "d100", key: null, dc: null }], actors: [ids.aria]
  });
  await message(player, id).locator(".stt-request-roll").first().click();
  const dialog = player.page.locator(".stt-divine-dialog.application");
  await dialog.waitFor({ timeout: 10_000 });
  await dialog.locator('.stt-divine-number[data-number="40"]').click();
  await capture(player, "divine-picker", dialog);

  await forceDice(player, [d100(47)]);
  await dialog.locator('button[data-action="roll"]').click();
  await waitForCard(player, id, c => c.rows[0].results.length, "Aria's d100");
  await capture(player, "divine-result", message(player, id));
});

shot("a player's roll request pop-up", async (ctx) => {
  const { player, ids } = ctx;
  await setSetting(ctx, "popupPlayers", true);
  await postRequest(ctx, {
    mode: "standard", parts: [{ type: "save", key: "dex", dc: 13 }], actors: [ids.aria, ids.borin], showDC: true
  });
  const popup = player.page.locator(".stt-request-popup.application");
  await popup.waitFor({ timeout: 10_000 });
  await capture(player, "popup-player", popup);
});

/* -------------------------------------------- */
/*  GM Guide                                    */
/* -------------------------------------------- */

shot("the GM's chat control", async ({ gm }) => {
  await capture(gm, "gm-chat-control", gm.page.locator("#chat-controls"), { pad: 4 });
});

shot("the request window", async ({ gm }) => {
  let app = await openWindow(gm);
  await app.locator('select[name$=".roll"]').first().selectOption("skill.ath");
  await app.locator('input[name$=".dc"]').first().fill("15");
  await capture(gm, "gm-request-window", app);

  await app.locator('[data-action="addChoice"]').first().click();
  await gm.page.waitForTimeout(300);
  await app.locator('select[name*=".alternatives."]').first().selectOption("skill.acr");
  await app.locator('input[name*=".alternatives."][name$=".dc"]').first().fill("10");
  await capture(gm, "gm-request-choices", app.locator(".stt-request-parts"));
  await app.locator('[data-action="close"]').click();

  for ( const mode of ["team", "challenge", "rolloff", "versus", "divine"] ) {
    app = await openWindow(gm, mode);
    if ( mode === "team" ) {
      await app.locator('select[name$=".roll"]').first().selectOption("skill.ath");
      await app.locator('input[name$=".dc"]').first().fill("13");
    }
    if ( mode === "rolloff" ) {
      await app.locator(".stt-request-side").nth(0).locator("label", { hasText: "Aria" }).click();
      await app.locator(".stt-request-side").nth(1).locator("label", { hasText: "Goblin" }).click();
    }
    // The player characters are ticked on the Players team already.
    if ( mode === "versus" ) await app.locator(".stt-request-side").nth(1).locator("label", { hasText: "Goblin" }).click();
    await capture(gm, `gm-request-window-${mode}`, app);
    await app.locator('[data-action="close"]').click();
    await app.waitFor({ state: "detached", timeout: 5000 });
  }
});

shot("a standard roll, hidden and shown", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "standard", parts: [athletics(15)], actors: [ids.aria, ids.borin, ids.goblin], showDC: false
  });
  await forceDice(player, [d20(17), d20(8)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await clickRoll(player, id, "Borin", { fastForward: true });
  await forceDice(gm, [d20(12)]);
  await clickRoll(gm, id, "Goblin", { fastForward: true });
  await waitForCard(gm, id, c => c.reveal === "Show to players", "the Show to players button");
  await waitForCard(player, id, c => c.rows.every(r => r.results.length || r.pending), "the player's card");
  await capture(gm, "gm-request-hidden", message(gm, id));
  await capture(player, "player-request-hidden", message(player, id));

  await gm.page.locator(`#chat [data-message-id="${id}"] .stt-request-reveal`).click();
  await waitForCard(player, id, c => c.summary, "the shown result");
  await capture(player, "player-request-shown", message(player, id));

  await gm.page.locator(`#chat [data-message-id="${id}"] .stt-request-dc-edit`).first().click();
  const dialog = gm.page.locator(".stt-dc-dialog.application");
  await dialog.waitFor({ timeout: 10_000 });
  await dialog.locator('input[name="dc"]').fill("12");
  await capture(gm, "gm-change-dc", dialog);
  await dialog.locator('button[data-action="ok"]').click();
  await dialog.waitFor({ state: "detached", timeout: 10_000 });
  await gm.page.waitForTimeout(500);
  await capture(gm, "gm-request-dc-changed", message(gm, id));
});

shot("letting someone roll again", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "standard", parts: [athletics(15)], actors: [ids.aria, ids.borin], showDC: true });
  await forceDice(player, [d20(4)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await waitForCard(gm, id, c => c.rows[0].results.length, "Aria's result");
  await message(gm, id).locator(".stt-request-result.expandable").first().click();
  await message(gm, id).locator(".stt-request-roll-again").waitFor({ timeout: 5000 });
  await capture(gm, "gm-roll-again", message(gm, id));
});

shot("a skill challenge", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "challenge", successes: 2, actors: [ids.aria, ids.borin],
    parts: [athletics(12), { type: "skill", key: "ste", dc: 14 }, { type: "save", key: "con", dc: 13 }]
  });
  await forceDice(player, [d20(15), d20(16)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await waitForCard(player, id, c => c.rows[0].results.length >= 1, "Aria's first roll");
  await clickRoll(player, id, "Aria", { fastForward: true });
  await forceDice(player, [d20(5)]);
  await clickRoll(player, id, "Borin", { fastForward: true });
  await waitForCard(gm, id, c => c.rows.every(r => r.results.length), "the challenge rolls");
  await capture(gm, "gm-skill-challenge", message(gm, id));
});

shot("a team challenge", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "team", parts: [athletics(13)], actors: [ids.aria, ids.borin, ids.goblin] });
  await forceDice(player, [d20(20), d20(4)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await clickRoll(player, id, "Borin", { fastForward: true });
  await forceDice(gm, [d20(11)]);
  await clickRoll(gm, id, "Goblin", { fastForward: true });
  await waitForCard(gm, id, c => c.reveal === "Show to players", "the Show to players button");
  await gm.page.locator(`#chat [data-message-id="${id}"] .stt-request-reveal`).click();
  await waitForCard(gm, id, c => c.reveal === "Shown", "the result to be shown");
  await capture(gm, "gm-team-challenge", message(gm, id));
});

shot("a roll-off", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "rolloff", parts: [athletics(null), athletics(null)],
    sides: [[ids.aria], [ids.goblin]], actors: [ids.aria, ids.goblin]
  });
  await forceDice(player, [d20(14)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await forceDice(gm, [d20(9)]);
  await clickRoll(gm, id, "Goblin", { fastForward: true });
  await waitForRoll(gm, id, ids.goblin, 1);
  await waitForCard(gm, id, c => c.reveal === "Show NPC roll", "the Show NPC roll button");
  await capture(gm, "gm-rolloff", message(gm, id));
  await waitForCard(player, id, c => c.rows.every(r => r.results.length), "the player's roll-off");
  await capture(player, "player-rolloff", message(player, id));
});

shot("team vs team", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "versus", parts: [athletics(null), athletics(null)],
    sides: [[ids.aria, ids.borin], [ids.goblin]], actors: [ids.aria, ids.borin, ids.goblin]
  });
  await forceDice(player, [d20(13), d20(16)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await clickRoll(player, id, "Borin", { fastForward: true });
  await forceDice(gm, [d20(10)]);
  await clickRoll(gm, id, "Goblin", { fastForward: true });
  await waitForCard(gm, id, c => c.summary, "the team vs team result");
  await capture(gm, "gm-versus", message(gm, id));
});

shot("the GM's pop-up", async (ctx) => {
  const { gm, ids } = ctx;
  await setSetting(ctx, "popupGM", true);
  await postRequest(ctx, {
    mode: "standard", parts: [{ type: "check", key: "wis", dc: 12 }], actors: [ids.aria, ids.goblin], showDC: true
  });
  const popup = gm.page.locator(".stt-request-popup.application");
  await popup.waitFor({ timeout: 10_000 });
  await capture(gm, "popup-gm", popup);
});

shot("the module's settings", async ({ gm }) => {
  await gm.eval(() => game.settings.sheet.render({ force: true }));
  const app = gm.page.locator("#settings-config");
  await app.waitFor({ timeout: 10_000 });
  await app.locator(`[data-tab="${MODULE_ID}"]`).first().click();
  // Tall enough to show every setting without scrolling.
  await gm.eval(() => game.settings.sheet.setPosition({ top: 10, height: 780 }));
  await gm.page.waitForTimeout(500);
  await capture(gm, "gm-settings", app);
});

shot("the welcome card", async ({ gm }) => {
  const id = await gm.eval(async moduleId => {
    await game.settings.set(moduleId, "welcomeVersion", "");
    const { postWelcomeIfDue } = await import(`/modules/${moduleId}/scripts/welcome.mjs`);
    await postWelcomeIfDue();
    return game.messages.find(m => m.getFlag(moduleId, "welcome"))?.id;
  }, MODULE_ID);
  await capture(gm, "gm-welcome", message(gm, id));
});

shot("each settings menu", async ({ gm }) => {
  const menus = {
    heroCards: "hero-cards", diceRolling: "dice-rolling", rollRequests: "roll-requests", worldScripts: "world-scripts"
  };
  for ( const [key, name] of Object.entries(menus) ) {
    await gm.eval(({ moduleId, key }) => new (game.settings.menus.get(`${moduleId}.${key}`).type)().render({ force: true }),
      { moduleId: MODULE_ID, key });
    const app = gm.page.locator(`#stt-settings-${name}`);
    await app.waitFor({ timeout: 10_000 });
    await gm.page.waitForTimeout(300);
    await capture(gm, `gm-settings-${name}`, app);
    // Closed from code: clicking the close button would leave its tooltip fading out over the next menu's picture.
    await gm.eval(id => foundry.applications.instances.get(id)?.close(), `stt-settings-${name}`);
    await app.waitFor({ state: "detached", timeout: 5000 });
  }
});

shot("a death save request", async (ctx) => {
  const { gm, player } = ctx;
  await setSetting(ctx, "deathSavePrompt", true);
  const id = await gm.eval(async moduleId => {
    const aria = game.actors.getName("Aria");
    globalThis.__sttHP ??= {};
    globalThis.__sttHP[aria.id] ??= foundry.utils.deepClone(aria._source.system.attributes.hp);
    await aria.update({ "system.attributes.hp.max": 10, "system.attributes.hp.value": 0 });
    const combat = await Combat.create({ active: true });
    await combat.createEmbeddedDocuments("Combatant", [
      { actorId: aria.id, initiative: 15 }, { actorId: game.actors.getName("Goblin").id, initiative: 10 }
    ]);
    await combat.startCombat();
    for ( let i = 0; i < 50; i++ ) {
      const message = game.messages.contents.find(m => m.getFlag(moduleId, "deathSave"));
      if ( message ) return message.id;
      await new Promise(r => setTimeout(r, 100));
    }
    return null;
  }, MODULE_ID);
  if ( !id ) throw new Error("No death save request was posted.");
  await message(player, id).waitFor({ timeout: 10_000 });
  await message(player, id).scrollIntoViewIfNeeded();
  await capture(player, "death-save-request", message(player, id));
});

shot("the Gameplay Enhancements", async (ctx) => {
  const { gm, player } = ctx;
  for ( const key of ["fadeUnprepared", "rarityColours", "chatButtonLabels", "oneTabActivities"] ) {
    await setSetting(ctx, key, true);
  }
  const spell = (name, level, prepared) => ({ name, type: "spell", system: { level, method: "spell", prepared } });
  const ids = await gm.eval(async items => {
    const created = await game.actors.getName("Aria").createEmbeddedDocuments("Item", items);
    return created.map(i => i.id);
  }, [
    { name: "Potion of Healing", type: "loot", img: "icons/consumables/potions/potion-tube-corked-red.webp",
      system: { rarity: "common" } },
    { name: "Cloak of Elvenkind", type: "loot", img: "icons/equipment/back/cloak-collared-feathers-green.webp",
      system: { rarity: "uncommon" } },
    { name: "Flame Tongue", type: "loot", img: "icons/weapons/swords/sword-flanged-lightning.webp",
      system: { rarity: "rare" } },
    { name: "Staff of Power", type: "loot", img: "icons/weapons/staves/staff-ornate-red.webp",
      system: { rarity: "veryRare" } },
    { name: "Holy Avenger", type: "loot", img: "icons/weapons/swords/sword-guard-gold-red.webp",
      system: { rarity: "legendary" } },
    { name: "Orb of Dragonkind", type: "loot", img: "icons/commodities/gems/gem-cut-faceted-princess-purple.webp",
      system: { rarity: "artifact" } },
    spell("Shield", 1, 1), spell("Sleep", 1, 0), spell("Magic Missile", 1, 1), spell("Misty Step", 2, 0),
    spell("Hold Person", 2, 1)
  ]);
  try {
    const sheet = player.page.locator(".application.actor.sheet").first();
    for ( const [tab, name] of [["inventory", "world-scripts-rarity"], ["spells", "world-scripts-fade"]] ) {
      await player.eval(async tab => {
        const sheet = game.actors.getName("Aria").sheet;
        await sheet.render({ force: true });
        sheet.changeTab(tab, "primary");
        sheet.setPosition({ left: 120, top: 20, height: 760 });
      }, tab);
      await sheet.waitFor({ timeout: 10_000 });
      await player.page.waitForTimeout(800);
      await capture(player, name, sheet);
    }
    await player.eval(() => game.actors.getName("Aria").sheet.close());

    const id = await player.eval(async () => {
      const before = new Set(game.messages.keys());
      const attack = game.actors.getName("Aria").items.getName("Dagger").system.activities.find(a => a.type === "attack");
      await attack.use({ consume: false }, { configure: false }, { create: true });
      await new Promise(r => setTimeout(r, 500));
      return game.messages.contents.find(m => !before.has(m.id))?.id ?? null;
    });
    if ( !id ) throw new Error("The Dagger's attack posted no chat card.");
    await message(player, id).waitFor({ timeout: 10_000 });
    await message(player, id).scrollIntoViewIfNeeded();
    await capture(player, "world-scripts-chat-labels", message(player, id));

    await gm.eval(() => {
      const attack = game.actors.getName("Aria").items.getName("Dagger").system.activities.find(a => a.type === "attack");
      return attack.sheet.render({ force: true, position: { left: 20, top: 20 } });
    });
    const activity = gm.page.locator(".application.activity").first();
    await activity.waitFor({ timeout: 10_000 });
    await gm.page.waitForTimeout(800);
    await capture(gm, "world-scripts-one-tab", activity);
  } finally {
    await gm.eval(ids => game.actors.getName("Aria").deleteEmbeddedDocuments("Item", ids), ids);
  }
});

/* -------------------------------------------- */
/*  Run                                         */
/* -------------------------------------------- */

const filter = process.argv.slice(2).find(a => !a.startsWith("--"))?.toLowerCase();
fs.mkdirSync(OUT, { recursive: true });

ensureWorld();
console.log(`Starting Foundry with "${WORLD.title}"…`);
const server = await startFoundry(WORLD.id);
let gm;
let player;
const failed = [];
try {
  gm = await Session.open(GM_USER, { scale: 2 });
  await enableModules(gm);
  const ids = await resetFixtures(gm);
  // Portraits from dnd5e's own token art, so the cards look like a table in play.
  await gm.eval(async () => {
    const art = {
      Aria: "systems/dnd5e/tokens/heroes/RogueHalfling.webp",
      Borin: "systems/dnd5e/tokens/heroes/FighterShield.webp",
      Goblin: "systems/dnd5e/tokens/humanoid/Goblin.webp"
    };
    await Actor.updateDocuments(Object.entries(art).map(([name, img]) => ({
      _id: game.actors.getName(name).id, img, "prototypeToken.texture.src": img
    })));
  });
  // Unpaused, so the pause logo doesn't show through the windows.
  await gm.eval(() => game.togglePause(false, { broadcast: true }));
  player = await Session.open(PLAYER_USER, { scale: 2 });
  for ( const session of [gm, player] ) {
    await session.eval(() => { ui.sidebar.expand(); ui.sidebar.changeTab("chat", "primary"); });
  }
  for ( const { name, fn } of shots ) {
    if ( filter && !name.toLowerCase().includes(filter) ) continue;
    console.log(name);
    try {
      await resetWorld(gm, player);
      await fn({ gm, player, ids });
    } catch ( err ) {
      failed.push(name);
      console.error(`  FAILED: ${err.message}`);
      await gm.page.screenshot({ path: "test-e2e/shot-fail-gm.png" }).catch(() => {});
      await player.page.screenshot({ path: "test-e2e/shot-fail-player.png" }).catch(() => {});
    }
  }
} catch ( err ) {
  console.error(err);
  if ( gm ) console.error(`--- GM console ---\n${gm.tail(30)}`);
  if ( player ) console.error(`--- Player console ---\n${player.tail(30)}`);
  process.exitCode = 1;
} finally {
  await player?.close();
  await gm?.close({ shutDownWorld: true });
  await server.stop();
}

if ( failed.length ) {
  console.log(`\n${failed.length} failed: ${failed.join("; ")}`);
  process.exitCode = 1;
}
