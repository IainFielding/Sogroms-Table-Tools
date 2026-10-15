/**
 * End-to-end tests for roll requests and Hero Cards, run against a real Foundry world.
 *
 * The fixtures (see lib/world.mjs): the Player owns Aria and Borin, Aria holds the Hero Cards, and the
 * Goblin belongs to the GM. Every actor has 10 in each ability and no proficiencies, so a roll's total is
 * exactly the die forced for it.
 */

import { MODULE_ID, PLAYER_USER } from "./config.mjs";
import {
  assert, assertEqual, cardsOnRow, clickRoll, forceDice, playCard, postRequest, readCard, rollButton, rollModifiers, test,
  unusedDice,
  waitFor, waitForCard, waitForRoll
} from "./lib/harness.mjs";

const d20 = n => [n, 20];
const d100 = n => [n, 100];
const athletics = dc => ({ type: "skill", key: "ath", dc });
const row = (card, name) => card.rows.find(r => r.name === name);

/* -------------------------------------------- */
/*  Entry Points                                */
/* -------------------------------------------- */

test("the GM's chat controls have the request button, and the player's do not", async ({ gm, player }) => {
  const count = s => s.eval(() => document.querySelectorAll("#chat-controls .stt-request-control").length);
  assertEqual(await count(gm), 1, "GM request buttons");
  assertEqual(await count(player), 0, "player request buttons");
});

test("the token controls have the request button, with the tankard icon", async ({ gm, player }) => {
  const tool = s => s.eval(() => ui.controls.controls.tokens?.tools.sttRequest ?? null);
  const gmTool = await tool(gm);
  assert(gmTool, "The GM has no Request Rolls tool.");
  assertEqual(gmTool.icon, "fa-solid fa-beer-mug-empty", "tool icon");
  assertEqual(gmTool.button, true, "tool is a button");
  assertEqual(await tool(player), null, "the player's tool");
});

test("the token controls' request button has a grey border like the tools beside it, not a button's orange", async ({ gm }) => {
  const borders = await gm.eval(async () => {
    await ui.controls.activate({ control: "tokens" });
    const border = button => (button ? getComputedStyle(button).borderTopColor : null);
    // The active tool is ringed in orange too, so compare with one that isn't active.
    const other = document.querySelector('#scene-controls-tools button.tool[aria-pressed="false"]:not(.button, .toggle)');
    return {
      request: border(document.querySelector('#scene-controls-tools button[data-tool="sttRequest"]')),
      other: border(other)
    };
  });
  assert(borders.request, "The request button is not drawn in the token controls.");
  assert(borders.other, "There is no other inactive tool to compare with.");
  assertEqual(borders.request, borders.other, "request button border");
});

test("the theme's fonts load from the module, and nothing is fetched from Google", async (ctx) => {
  const { player, ids } = ctx;
  await postRequest(ctx, { mode: "standard", parts: [athletics(15)], actors: [ids.aria] });
  const fonts = await player.eval(async () => {
    await document.fonts.ready;
    const loaded = family => [...document.fonts].filter(f => (f.family.replace(/["']/g, "") === family)
      && (f.status === "loaded")).map(f => `${f.weight} ${f.style}`);
    return {
      cinzel: loaded("Cinzel"),
      spectral: loaded("Spectral"),
      remote: performance.getEntriesByType("resource").map(e => e.name).filter(n => /fonts\.(googleapis|gstatic)/.test(n))
    };
  });
  assert(fonts.cinzel.length, "No Cinzel font loaded for the request card's heading.");
  assert(fonts.spectral.length, "No Spectral font loaded for the request card's text.");
  assertEqual(fonts.remote, [], "font files fetched from Google");
}, { skip: { crlngn: "Carolingian UI fetches its own fonts from Google." } });

test("the API opens the request window for the GM only", async ({ gm, player }) => {
  const open = s => s.eval(async moduleId => {
    const app = game.modules.get(moduleId).api.requestRolls();
    await new Promise(r => setTimeout(r, 500));
    const rendered = !!document.getElementById("stt-roll-request");
    await app?.close();
    return rendered;
  }, MODULE_ID);
  assertEqual(await open(gm), true, "GM window rendered");
  assertEqual(await open(player), false, "player window rendered");
});

test("the API posts a request from a macro, filling in what it leaves out, and refuses one it can't roll", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await gm.eval(async ({ moduleId, aria }) => {
    const { createRequest } = game.modules.get(moduleId).api;
    return (await createRequest({ mode: "standard", parts: [{ type: "skill", key: "ath", dc: 12 }], actors: [aria] })).id;
  }, { moduleId: MODULE_ID, aria: ids.aria });
  const card = await waitForCard(player, id, c => row(c, "Aria"), "the macro's request");
  assertEqual(card.title, "Athletics Check", "the title");
  const request = await gm.eval(({ moduleId, id }) => game.messages.get(id).getFlag(moduleId, "request"), { moduleId: MODULE_ID, id });
  assertEqual({ rollMode: request.rollMode, showDC: request.showDC }, { rollMode: "public", showDC: false }, "the defaults");

  const refused = await gm.eval(async ({ moduleId, aria }) => {
    const before = game.messages.size;
    try {
      await game.modules.get(moduleId).api.createRequest({
        mode: "standard", parts: [{ type: "skill", key: "athletics", dc: 12 }], actors: [aria]
      });
    } catch ( err ) {
      return { message: err.message, posted: game.messages.size !== before };
    }
    return null;
  }, { moduleId: MODULE_ID, aria: ids.aria });
  assert(refused, "The request with an unknown skill was posted.");
  assertEqual(refused.posted, false, "a message posted for the refused request");
  assert(refused.message.startsWith("Unknown skill for a roll: athletics."), `Unexpected refusal: ${refused.message}`);

  // A player's request wouldn't be drawn as one, so they are refused, rather than posting a plain message.
  const fromPlayer = await player.eval(async ({ moduleId, aria }) => {
    try {
      await game.modules.get(moduleId).api.createRequest({
        mode: "standard", parts: [{ type: "skill", key: "ath", dc: 12 }], actors: [aria]
      });
    } catch ( err ) {
      return err.message;
    }
    return null;
  }, { moduleId: MODULE_ID, aria: ids.aria });
  assertEqual(fromPlayer, "Only a GM can post a roll request.", "the player's refusal");
});

/* -------------------------------------------- */
/*  Request Window                              */
/* -------------------------------------------- */

/**
 * Open the request window through its chat control button, as the GM would.
 * @param {import("./lib/session.mjs").Session} gm
 */
async function openWindow(gm) {
  await gm.page.locator("#chat-controls .stt-request-control").click();
  const app = gm.page.locator("#stt-roll-request");
  await app.waitFor({ timeout: 10_000 });
  return app;
}

/**
 * @param {import("playwright").Locator} app
 * @param {string} mode
 */
async function chooseMode(app, mode) {
  await app.locator(`.stt-request-mode:has(input[value="${mode}"])`).click();
  await app.locator(`.stt-request-mode:has(input[value="${mode}"]:checked)`).waitFor({ timeout: 5000 });
  await app.page().waitForTimeout(300);
}

/**
 * What the window currently shows.
 * @param {import("playwright").Locator} app
 */
function readWindow(app) {
  return app.evaluate(el => ({
    modes: [...el.querySelectorAll(".stt-request-mode input")].map(i => i.value),
    checkedMode: el.querySelector(".stt-request-mode input:checked")?.value,
    rollSelects: [...el.querySelectorAll('select[name$=".roll"]')].map(s => s.name),
    rollValues: [...el.querySelectorAll('select[name$=".roll"]')].map(s => s.value),
    dcInputs: [...el.querySelectorAll('input[name$=".dc"]')].map(i => i.value),
    dice: [...(el.querySelector('select[name$=".roll"]')?.options ?? [])].map(o => o.value).filter(v => !v.includes(".")),
    successes: !!el.querySelector('select[name="successes"]'),
    actors: [...el.querySelectorAll('input[name^="actors."], input[name="actor"]')].map(i => ({
      name: i.closest("label").textContent.trim(), type: i.type, checked: i.checked
    })),
    picks: el.querySelectorAll(".stt-request-pick").length,
    selectAll: !!el.querySelector('[data-action="selectAll"]'),
    sides: [...el.querySelectorAll(".stt-request-side")].map(s => ({
      label: s.querySelector("legend").textContent.trim(),
      inputs: [...s.querySelectorAll("input")].map(i => i.type)
    })),
    range: (() => {
      const r = el.querySelector('range-picker[name="range"]');
      return r ? { value: Number(r.value), min: Number(r.getAttribute("min")), max: Number(r.getAttribute("max")) } : null;
    })(),
    showDC: !!el.querySelector('input[name="showDC"]'),
    showDCChecked: !!el.querySelector('input[name="showDC"]')?.checked
  }));
}

test("the request window shows each mode's own fields", async ({ gm }) => {
  const app = await openWindow(gm);
  try {
    let form = await readWindow(app);
    assertEqual(form.modes, ["standard", "team", "challenge", "rolloff", "versus", "divine"], "modes");
    assertEqual(form.checkedMode, "standard", "starting mode");
    assertEqual(form.rollSelects.length, 1, "standard roll pickers");
    assertEqual(form.rollValues, ["d20"], "standard roll to start with");
    assertEqual(form.dice, ["d20", "d6", "d8", "d10", "d12", "d100"], "standard dice");
    assertEqual(form.dcInputs, [""], "standard DC, blank to start with");
    assertEqual(form.actors.map(a => `${a.name}:${a.checked}`), ["Aria:true", "Borin:true", "Goblin:false"],
      "who rolls, with the player characters ticked");
    assertEqual(form.showDC, true, "Show DC option");
    assertEqual(form.showDCChecked, false, "Show DC to Players, which the default setting leaves unticked");

    await chooseMode(app, "challenge");
    form = await readWindow(app);
    assertEqual(form.rollSelects.length, 3, "skill challenge roll pickers");
    assertEqual(form.dcInputs, ["", "", ""], "skill challenge DCs, blank to start with");
    assertEqual(form.successes, true, "successes needed");

    await chooseMode(app, "rolloff");
    form = await readWindow(app);
    assertEqual(form.rollSelects.length, 2, "roll-off roll pickers");
    assertEqual(form.rollValues, ["d20", "d20"], "roll-off rolls to start with");
    assertEqual(form.dcInputs.length, 0, "roll-off DCs");
    assertEqual(form.dice, ["d20", "d6", "d8", "d10", "d12", "d100"], "roll-off dice");
    assertEqual(form.sides.map(s => s.label), ["Challenger", "Opponent"], "roll-off sides");
    assert(form.sides.every(s => s.inputs.every(t => t === "radio")), "A roll-off side picks one actor.");
    assertEqual(form.showDC, false, "Show DC option in a roll-off");

    await chooseMode(app, "versus");
    form = await readWindow(app);
    assertEqual(form.dice, ["d20"], "team vs team dice");
    assertEqual(form.sides.map(s => s.label.replace(/\s+/g, " ")), ["Players", "NPCs"], "team vs team sides");
    assert(form.sides.every(s => s.inputs.every(t => t === "checkbox")), "A team picks several actors.");

    await chooseMode(app, "divine");
    form = await readWindow(app);
    assertEqual(form.rollSelects.length, 0, "divine intervention roll pickers");
    assertEqual(form.range, { value: 16, min: 1, max: 50 }, "divine intervention range");
    assertEqual(form.showDC, false, "Show DC option in divine intervention");
    // One actor prays, so the window offers radio buttons with only the first of those ticked before still ticked.
    assertEqual(form.actors.map(a => `${a.name}:${a.type}:${a.checked}`),
      ["Aria:radio:true", "Borin:radio:false", "Goblin:radio:false"], "divine intervention's one actor");
    assertEqual([form.picks, form.selectAll], [0, false], "quick picks and Select All in divine intervention");
  } finally {
    await gm.eval(() => foundry.applications.instances.get("stt-roll-request")?.close());
  }
});

test("the request window keeps what was filled in when the mode changes", async ({ gm }) => {
  const app = await openWindow(gm);
  try {
    await app.locator('input[name="standard.dc"]').fill("17");
    await app.locator('select[name="standard.roll"]').selectOption("save.dex");
    await chooseMode(app, "challenge");
    await chooseMode(app, "standard");
    assertEqual(await app.locator('input[name="standard.dc"]').inputValue(), "17", "DC after switching back");
    assertEqual(await app.locator('select[name="standard.roll"]').inputValue(), "save.dex", "roll after switching back");

    // A roll-off keeps its own rolls, d20 against d20, rather than taking the standard roll's.
    await chooseMode(app, "rolloff");
    assertEqual((await readWindow(app)).rollValues, ["d20", "d20"], "roll-off rolls after setting a standard roll");
    await app.locator('select[name="sideRolls.1.roll"]').selectOption("d100");
    await chooseMode(app, "standard");
    await chooseMode(app, "rolloff");
    assertEqual((await readWindow(app)).rollValues, ["d20", "d100"], "roll-off rolls after switching back");

    // Team vs Team has its own rolls, d20 against d20, which a roll-off's choices leave alone.
    await chooseMode(app, "versus");
    assertEqual((await readWindow(app)).rollValues, ["d20", "d20"], "team vs team rolls after setting a roll-off");
    await chooseMode(app, "rolloff");
    assertEqual((await readWindow(app)).rollValues, ["d20", "d100"], "roll-off rolls after visiting team vs team");

    // Divine Intervention's one actor is its own, so picking them leaves who rolls in the other modes alone.
    const actors = async () => (await readWindow(app)).actors.map(a => `${a.name}:${a.checked}`);
    await chooseMode(app, "divine");
    await app.locator(".stt-request-actor-choice", { hasText: "Borin" }).click();
    await chooseMode(app, "standard");
    assertEqual(await actors(), ["Aria:true", "Borin:true", "Goblin:false"], "who rolls after picking who prays");
    await chooseMode(app, "divine");
    assertEqual(await actors(), ["Aria:false", "Borin:true", "Goblin:false"], "who prays after switching back");
  } finally {
    await gm.eval(() => foundry.applications.instances.get("stt-roll-request")?.close());
  }
});

test("sending a standard request posts it to chat and closes the window", async ({ gm, ids }) => {
  const app = await openWindow(gm);
  await chooseMode(app, "standard");
  await app.locator('select[name="standard.roll"]').selectOption("skill.acr");
  await app.locator('input[name="standard.dc"]').fill("13");
  await app.locator('input[name="actors.2"]').evaluate(el => { el.checked = true; });
  await app.locator('button[type="submit"]').click();
  const request = await waitFor(gm, moduleId => game.messages.contents.at(-1)?.getFlag(moduleId, "request") ?? null,
    MODULE_ID, "the request message");
  assertEqual(request.mode, "standard", "mode");
  assertEqual(request.parts, [{ type: "skill", key: "acr", dc: 13 }], "parts");
  assertEqual(request.actors, [ids.aria, ids.borin, ids.goblin], "actors");
  await waitFor(gm, () => !document.getElementById("stt-roll-request"), null, "the window to close");

  // The next request starts from the same roll, but with its DC blank again.
  const next = await openWindow(gm);
  try {
    assertEqual(await next.locator('select[name="standard.roll"]').inputValue(), "skill.acr", "the roll on reopening");
    assertEqual(await next.locator('input[name="standard.dc"]').inputValue(), "", "the DC on reopening");
  } finally {
    await gm.eval(() => foundry.applications.instances.get("stt-roll-request")?.close());
  }
});

test("the Show DC to Players box starts from the GM's setting", async ({ gm }) => {
  const setting = await gm.eval(moduleId => {
    const s = game.settings.settings.get(`${moduleId}.showDCDefault`);
    return { config: s?.config, scope: s?.scope, default: s?.default };
  }, MODULE_ID);
  assertEqual(setting, { config: false, scope: "world", default: false }, "the setting");
  await gm.eval(moduleId => game.settings.set(moduleId, "showDCDefault", true), MODULE_ID);
  try {
    const app = await openWindow(gm);
    assertEqual((await readWindow(app)).showDCChecked, true, "Show DC to Players with the setting on");
  } finally {
    await gm.eval(async moduleId => {
      await foundry.applications.instances.get("stt-roll-request")?.close();
      await game.settings.set(moduleId, "showDCDefault", false);
    }, MODULE_ID);
  }
});

test("the DC starts from the GM's Default DC setting", async ({ gm }) => {
  await gm.eval(moduleId => game.settings.set(moduleId, "defaultDC", 14), MODULE_ID);
  try {
    const app = await openWindow(gm);
    await chooseMode(app, "standard");
    assertEqual((await readWindow(app)).dcInputs, ["14"], "the standard DC with the setting at 14");
    await chooseMode(app, "challenge");
    assertEqual((await readWindow(app)).dcInputs, ["14", "14", "14"], "the skill challenge DCs with the setting at 14");
  } finally {
    await gm.eval(async moduleId => {
      await foundry.applications.instances.get("stt-roll-request")?.close();
      await game.settings.set(moduleId, "defaultDC", null);
    }, MODULE_ID);
  }
});

test("sending a roll-off asks for a d20 from each side by default", async ({ gm, ids }) => {
  const app = await openWindow(gm);
  await chooseMode(app, "rolloff");
  await app.locator('input[name="rivals.0"][value="0"]').check({ force: true });
  await app.locator('input[name="rivals.1"][value="2"]').check({ force: true });
  await app.locator('button[type="submit"]').click();
  const request = await waitFor(gm, moduleId => game.messages.contents.at(-1)?.getFlag(moduleId, "request") ?? null,
    MODULE_ID, "the request message");
  assertEqual(request.mode, "rolloff", "mode");
  assertEqual(request.parts, [{ type: "d20", key: null, dc: null }, { type: "d20", key: null, dc: null }], "parts");
  assertEqual(request.sides, [[ids.aria], [ids.goblin]], "sides");
});

test("the request window refuses requests it cannot run", async ({ gm }) => {
  const attempt = async (setup, expected) => {
    const app = await openWindow(gm);
    try {
      await setup(app);
      const before = await gm.eval(() => game.messages.size);
      await app.locator('button[type="submit"]').click();
      await gm.page.locator("#notifications .notification.error", { hasText: expected }).waitFor({ timeout: 5000 })
        .catch(() => { throw new Error(`No "${expected}" error.`); });
      assertEqual(await gm.eval(() => game.messages.size), before, `messages after "${expected}"`);
      assert(await app.isVisible(), `The window closed after "${expected}".`);
    } finally {
      await gm.eval(() => foundry.applications.instances.get("stt-roll-request")?.close());
      await gm.eval(() => ui.notifications.clear?.());
    }
  };

  await attempt(async app => {
    await chooseMode(app, "standard");
    for ( const box of await app.locator('input[name^="actors."]').all() ) await box.evaluate(el => { el.checked = false; });
  }, "Choose at least one actor to roll.");

  await attempt(async app => {
    await chooseMode(app, "challenge");
    await app.locator('input[name="parts.1.dc"]').fill("");
  }, "Each roll in a skill challenge needs a DC.");

  await attempt(async app => {
    await chooseMode(app, "team");
    await app.locator('select[name="scoring"]').selectOption("leader");
    await app.locator('input[name="parts.0.dc"]').fill("");
  }, "This way of scoring a Team Challenge needs a DC.");

  await attempt(async app => {
    await chooseMode(app, "rolloff");
    await app.locator('input[name="rivals.0"][value="0"]').check({ force: true });
    await app.locator('input[name="rivals.1"][value="0"]').check({ force: true });
  }, "No one can be on both sides.");

  await attempt(async app => {
    await chooseMode(app, "versus");
    for ( const box of await app.locator('input[name^="teams.1."]').all() ) await box.evaluate(el => { el.checked = false; });
  }, "Choose who rolls for the NPCs.");
});

/* -------------------------------------------- */
/*  Quick Picks                                 */
/* -------------------------------------------- */

/**
 * Make Aria and Borin dnd5e's primary party, "The Wanderers", and start a combat with the Goblin as a hostile combatant.
 * @param {import("./lib/session.mjs").Session} gm
 * @returns {Promise<{ party: string, disposition: number }>}  The party's ID, and the Goblin token's disposition before.
 */
function setUpPartyAndCombat(gm) {
  return gm.eval(async () => {
    const [aria, borin, goblin] = ["Aria", "Borin", "Goblin"].map(name => game.actors.getName(name));
    const party = await Actor.create({
      name: "The Wanderers", type: "group", system: { members: [{ actor: aria.id }, { actor: borin.id }] }
    });
    await game.settings.set("dnd5e", "primaryParty", { actor: party });
    const scene = game.scenes.active;
    const token = scene.tokens.getName("Goblin");
    const disposition = token.disposition;
    await token.update({ disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE });
    // Made active once it has a combatant: Foundry fails to start the turn of a combat created active and empty.
    const combat = await Combat.create({ scene: scene.id });
    await combat.createEmbeddedDocuments("Combatant", [{ tokenId: token.id, sceneId: scene.id, actorId: goblin.id }]);
    await combat.update({ active: true });
    return { party: party.id, disposition };
  });
}

/**
 * Undo setUpPartyAndCombat. The combat is deleted between tests anyway.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {{ party: string, disposition: number }} setup
 */
function tearDownPartyAndCombat(gm, setup) {
  return gm.eval(async ({ party, disposition }) => {
    await foundry.applications.instances.get("stt-roll-request")?.close();
    await game.settings.set("dnd5e", "primaryParty", { actor: null });
    await game.actors.get(party)?.delete();
    await game.scenes.active.tokens.getName("Goblin")?.update({ disposition });
  }, setup);
}

/**
 * Each quick pick in the window, as "id:pressed", and who is ticked.
 * @param {import("playwright").Locator} app
 */
function readPicks(app) {
  return app.evaluate(el => ({
    picks: [...el.querySelectorAll(".stt-request-pick")].map(b => `${b.dataset.group}${b.dataset.side ? `@${b.dataset.side}` : ""}`
      + `:${b.getAttribute("aria-pressed")}`),
    labels: [...el.querySelectorAll(".stt-request-pick-label")].map(l => l.textContent.trim()),
    ticked: [...el.querySelectorAll('input[type="checkbox"]:checked')]
      .map(i => `${i.name.split(".").slice(0, -1).join(".")}:${i.closest("label").textContent.trim()}`)
  }));
}

test("quick picks: the party and the combat's hostile combatants are ticked, or unticked, in one click", async ({ gm }) => {
  const setup = await setUpPartyAndCombat(gm);
  try {
    const app = await openWindow(gm);
    // The window starts on the last kind of request sent, which an earlier test may have made a Roll-Off.
    await chooseMode(app, "standard");
    let form = await readPicks(app);
    assertEqual(form.labels, ["The Wanderers", "Combat: everyone", "Combat: hostile", "Everyone on scene"], "quick picks");
    // The player characters start ticked, and they are the whole party.
    assertEqual(form.picks, ["party:true", "combat:false", "hostile:false", "scene:false"], "which picks are ticked");

    await app.locator('.stt-request-pick[data-group="party"]').click();
    await app.locator('.stt-request-pick[data-group="hostile"]').click();
    await gm.page.waitForTimeout(300);
    form = await readPicks(app);
    assertEqual(form.ticked, ["actors:Goblin"], "who is ticked after unticking the party and ticking the hostiles");
    assertEqual(form.picks, ["party:false", "combat:true", "hostile:true", "scene:true"], "which picks are ticked after");

    // In Team vs Team, the NPCs start as the hostile combatants, and each side has its own picks.
    await chooseMode(app, "versus");
    form = await readPicks(app);
    assert(form.ticked.includes("teams.1:Goblin"), `The Goblin isn't on the NPCs' side: ${form.ticked.join(", ")}`);
    assertEqual(form.picks, ["party@0:true", "combat@0:false", "scene@0:false", "combat@1:true", "hostile@1:true",
      "scene@1:true"], "each side's picks");
    // Ticking everyone on the scene for the players takes the Goblin off the NPCs' side.
    await app.locator('.stt-request-pick[data-group="scene"][data-side="0"]').click();
    await gm.page.waitForTimeout(300);
    form = await readPicks(app);
    assert(!form.ticked.includes("teams.1:Goblin"), "The Goblin is on both sides.");
  } finally {
    await tearDownPartyAndCombat(gm, setup);
  }
});

test("quick picks: a macro can open the window with a group ticked", async ({ gm }) => {
  const setup = await setUpPartyAndCombat(gm);
  try {
    await gm.eval(moduleId => game.modules.get(moduleId).api.requestRolls({ mode: "team", group: "hostile" }), MODULE_ID);
    const app = gm.page.locator("#stt-roll-request");
    await app.waitFor({ timeout: 10_000 });
    const form = await readWindow(app);
    assertEqual(form.checkedMode, "team", "the mode the macro asked for");
    assertEqual(form.actors.filter(a => a.checked).map(a => a.name), ["Goblin"], "who the macro asked for");
  } finally {
    await tearDownPartyAndCombat(gm, setup);
  }
});

/* -------------------------------------------- */
/*  Standard Roll                               */
/* -------------------------------------------- */

test("standard roll: the player rolls through dnd5e's roll window and the GM fast-forwards", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "standard", parts: [athletics(12)], actors: [ids.aria, ids.goblin] });

  let card = await readCard(player, id);
  assertEqual(row(card, "Aria").rollButtons, 1, "the player's Roll button for Aria");
  assertEqual(row(card, "Goblin").rollButtons, 0, "the player's Roll button for the GM's Goblin");
  card = await readCard(gm, id);
  assertEqual(card.rows.map(r => r.rollButtons), [1, 1], "the GM's Roll buttons");

  await forceDice(player, [d20(5)]);
  await clickRoll(player, id, "Aria");
  const aria = await waitForRoll(gm, id, ids.aria);
  // The DC stays off the roll, so dnd5e's own message does not tell the player they failed.
  assertEqual([aria.type, aria.total, aria.target, aria.author], ["check", 5, null, "Player"], "Aria's roll message");
  assertEqual(aria.flavor, "Strength (Athletics) Check", "Aria's roll flavor");

  await forceDice(gm, [d20(15)]);
  await clickRoll(gm, id, "Goblin", { fastForward: true });
  await waitForRoll(gm, id, ids.goblin);

  for ( const session of [gm, player] ) {
    card = await waitForCard(session, id, c => c.rows.every(r => r.results.length), "both results");
    assertEqual(card.rows.map(r => r.rollButtons), [0, 0], `Roll buttons once rolled (${session.user})`);
  }
  card = await readCard(gm, id);
  assertEqual(row(card, "Aria").results, [{ text: "5", classes: ["failure"] }], "Aria's result, for the GM");
  assertEqual(row(card, "Goblin").results, [{ text: "15", classes: ["success"] }], "Goblin's result, for the GM");
  assertEqual(await unusedDice(player), 0, "the player's forced dice all used");
}, { skip: { midi: "Midi-QOL fast-forwards rolls, so dnd5e's roll window does not open." } });

test("standard roll: players see no pass or fail, on the card or the roll, until the GM shows the result", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "standard", parts: [{ type: "save", key: "dex", dc: 15 }], actors: [ids.aria, ids.borin] });
  await forceDice(player, [d20(5), d20(17)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await clickRoll(player, id, "Borin", { fastForward: true });

  let card = await waitForCard(player, id, c => c.rows.every(r => r.results.length), "both saves");
  assertEqual(card.rows.map(r => [r.name, r.classes, r.results]),
    [["Aria", [], [{ text: "5", classes: [] }]], ["Borin", [], [{ text: "17", classes: [] }]]],
    "the player's rows before the result is shown");
  const marked = await player.eval(() => [...document.querySelectorAll("#chat .chat-log li.chat-message:not([hidden])")]
    .flatMap(li => [...li.querySelectorAll(".dice-roll.success, .dice-roll.failure")]).length);
  assertEqual(marked, 0, "rolls in the player's chat marked as passing or failing");

  card = await readCard(gm, id);
  assertEqual(card.rows.map(r => r.classes), [["failure"], ["success"]], "the GM's rows");

  await gm.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-request-reveal`).click();
  card = await waitForCard(player, id, c => c.summary, "the result to be shown");
  assertEqual(card.rows.map(r => r.classes), [["failure"], ["success"]], "the player's rows once shown");
  assertEqual(card.rows.map(r => r.results[0].classes), [["failure"], ["success"]], "the player's results once shown");
});

test("standard roll: the summary is hidden from players until the GM shows it", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "standard", parts: [athletics(12)], actors: [ids.goblin] });
  await forceDice(gm, [d20(14)]);
  await clickRoll(gm, id, "Goblin", { fastForward: true });

  let card = await waitForCard(gm, id, c => c.summary, "the GM's summary");
  assertEqual(card.summary, "1 of 1 succeeded Show to players", "the GM's summary");
  card = await waitForCard(player, id, c => c.rows[0].results.length, "the player's result");
  assertEqual(card.summary, null, "the player's summary before it is shown");

  await gm.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-request-reveal`).click();
  card = await waitForCard(player, id, c => c.summary, "the player's summary");
  assertEqual(card.summary, "1 of 1 succeeded", "the player's summary once shown");
  assertEqual(card.reveal, null, "a reveal button for the player");
  card = await waitForCard(gm, id, c => c.reveal === "Shown", "the GM's Shown button");

  await gm.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-request-reveal`).click();
  await waitForCard(player, id, c => !c.summary, "the summary to be hidden again");
});

test("standard roll: a public roll with its DC shown starts shown, and the GM can hide it", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await gm.eval(async ({ moduleId, aria }) => (await game.modules.get(moduleId).api.createRequest({
    mode: "standard", parts: [{ type: "skill", key: "ath", dc: 12 }], actors: [aria], showDC: true
  })).id, { moduleId: MODULE_ID, aria: ids.aria });
  await waitForCard(player, id, c => row(c, "Aria"), "the request");
  await forceDice(player, [d20(5)]);
  await clickRoll(player, id, "Aria", { fastForward: true });

  let card = await waitForCard(player, id, c => c.summary, "the player's summary, shown from the start");
  assertEqual([card.summary, row(card, "Aria").classes], ["0 of 1 succeeded", ["failure"]], "the player's card");
  card = await waitForCard(gm, id, c => c.reveal, "the GM's reveal button");
  assertEqual(card.reveal, "Shown", "the GM's reveal button");

  await gm.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-request-reveal`).click();
  card = await waitForCard(player, id, c => !c.summary, "the summary to be hidden");
  assertEqual(row(card, "Aria").classes, [], "the player's row once hidden");
});

test("standard roll: a blind roll is hidden from the player who made it", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "standard", parts: [athletics(1)], actors: [ids.aria], rollMode: "blind" });
  await forceDice(player, [d20(14)]);
  await clickRoll(player, id, "Aria", { fastForward: true });

  let card = await waitForCard(gm, id, c => row(c, "Aria").results.length, "the GM's result");
  assertEqual(row(card, "Aria").results[0].classes, ["success"], "the GM's result");
  card = await waitForCard(player, id, c => row(c, "Aria").results.length, "the player's result");
  assertEqual([row(card, "Aria").results[0], row(card, "Aria").rollButtons, row(card, "Aria").cardButton],
    [{ text: "?", classes: [] }, 0, false], "the player's own roll, hidden from them");
});

test("standard roll: a hidden DC stays off the card and off the player's roll", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "standard", parts: [athletics(12)], actors: [ids.aria], showDC: false });
  assertEqual((await readCard(player, id)).subtitle, "Standard Roll · DC ?", "the player's subtitle");
  assertEqual((await readCard(gm, id)).subtitle, "Standard Roll · DC 12", "the GM's subtitle");
  await forceDice(player, [d20(13)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  const aria = await waitForRoll(gm, id, ids.aria);
  assertEqual(aria.target, null, "the roll's target");
  await waitForCard(gm, id, c => row(c, "Aria").results[0]?.classes.includes("success"), "Aria scored against the DC");
});

// The e2e world doesn't run Dice So Nice, so a stand-in does what it does to a new roll message: marks it as animating,
// then calls diceSoNiceRollComplete once the dice land.
test("dice so nice: a roll shows as rolling on the card until its dice land", async (ctx) => {
  const { gm, player, ids } = ctx;
  const sessions = [gm, player];
  for ( const session of sessions ) {
    await session.eval(() => {
      const { get: modules } = game.modules;
      const { get: settings } = game.settings;
      const hook = Hooks.on("createChatMessage", m => {
        if ( m.getFlag("sogrom-table-tools", "requestRoll") ) m._dice3danimating = true;
      });
      game.modules.get = id => (id === "dice-so-nice" ? { active: true } : modules.call(game.modules, id));
      game.settings.get = (scope, key) => (scope === "dice-so-nice" ? false : settings.call(game.settings, scope, key));
      window.dsnRestore = () => {
        Hooks.off("createChatMessage", hook);
        game.modules.get = modules;
        game.settings.get = settings;
      };
    });
  }
  try {
    const id = await postRequest(ctx, { mode: "standard", parts: [athletics(12)], actors: [ids.goblin] });
    await forceDice(gm, [d20(14)]);
    await clickRoll(gm, id, "Goblin", { fastForward: true });
    const roll = await waitForRoll(gm, id, ids.goblin);

    for ( const session of sessions ) {
      const card = await waitForCard(session, id, c => c.rows[0].results.length, `the rolling result (${session.user})`);
      assertEqual(card.rows[0].results, [{ text: "", classes: ["rolling"] }], `the result while rolling (${session.user})`);
      assertEqual([card.rows[0].classes, card.rows[0].rollButtons, card.summary], [[], 0, null],
        `the row and summary while rolling (${session.user})`);
    }

    for ( const session of sessions ) {
      await session.eval(id => {
        delete game.messages.get(id)._dice3danimating;
        Hooks.callAll("diceSoNiceRollComplete", id);
      }, roll.id);
    }
    const card = await waitForCard(gm, id, c => c.summary, "the GM's summary once the dice land");
    assertEqual(card.rows[0].results, [{ text: "14", classes: ["success"] }], "the result once the dice land");
    await waitForCard(player, id, c => c.rows[0].results[0]?.text === "14", "the player's result once the dice land");
  } finally {
    for ( const session of sessions ) await session.eval(() => { window.dsnRestore?.(); delete window.dsnRestore; });
  }
});

test("standard roll: deleting a roll brings the Roll button back", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "standard", parts: [athletics(12)], actors: [ids.aria] });
  await forceDice(player, [d20(3)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  const roll = await waitForRoll(gm, id, ids.aria);
  await waitForCard(player, id, c => row(c, "Aria").rollButtons === 0, "the Roll button to go");
  await gm.eval(id => game.messages.get(id).delete(), roll.id);
  await waitForCard(player, id, c => row(c, "Aria").rollButtons === 1, "the Roll button to come back");
});

test("standard roll: the GM's Roll again button, under an attached roll's dice, lets the actor roll again", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "standard", parts: [athletics(12)], actors: [ids.aria] });
  await forceDice(player, [d20(3)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  const roll = await waitForRoll(gm, id, ids.aria);
  await waitForCard(player, id, c => row(c, "Aria").rollButtons === 0, "the Roll button to go");

  // Players open the dice too, but get no button: they can't delete the roll.
  const card = s => s.page.locator(`#chat .chat-log [data-message-id="${id}"]`);
  await card(player).locator(".stt-request-result.expandable").click();
  await card(player).locator(".stt-request-roll-detail").waitFor({ timeout: 5000 });
  assertEqual(await card(player).locator(".stt-request-roll-again").count(), 0, "Roll again buttons for the player");

  await card(gm).locator(".stt-request-result.expandable").click();
  const button = card(gm).locator(".stt-request-roll-detail .stt-request-roll-again");
  await button.waitFor({ timeout: 5000 });
  assertEqual(await button.getAttribute("data-tooltip-text"), "Delete this roll, so Aria can roll again.", "the tooltip");

  // Cancelling keeps the roll.
  await button.click();
  let dialog = gm.page.locator(".application.dialog", { hasText: "Delete Aria's roll?" });
  await dialog.waitFor({ timeout: 5000 });
  await dialog.locator('button[data-action="no"]').click();
  await dialog.waitFor({ state: "detached", timeout: 5000 });
  assertEqual(await gm.eval(id => game.messages.has(id), roll.id), true, "the roll, after cancelling");

  await button.click();
  dialog = gm.page.locator(".application.dialog", { hasText: "Delete Aria's roll?" });
  await dialog.locator('button[data-action="yes"]').click();
  await waitFor(gm, id => !game.messages.has(id), roll.id, "the roll to be deleted");
  await waitForCard(player, id, c => row(c, "Aria").rollButtons === 1, "the Roll button to come back");
});

test("standard roll: a player can't delete their roll to roll again", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "standard", parts: [athletics(12)], actors: [ids.aria] });
  await forceDice(player, [d20(3)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  // Waited for on the player's side, so the message has reached them before they try to delete it.
  const roll = await waitForRoll(player, id, ids.aria);
  const deleted = await player.eval(async id => !!(await game.messages.get(id).delete()), roll.id);
  assertEqual(deleted, false, "the player's delete");
  await player.page.locator("#notifications .notification", { hasText: "Only the GM can delete" }).waitFor({ timeout: 5000 });
  await gm.page.waitForTimeout(500);
  assertEqual(await gm.eval(id => game.messages.has(id), roll.id), true, "the roll, after the player tried to delete it");
  const card = await readCard(player, id);
  assertEqual([row(card, "Aria").results[0]?.text, row(card, "Aria").rollButtons], ["3", 0], "Aria's row");
});

test("standard roll: a player's roll for an actor they don't own doesn't count", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "standard", parts: [athletics(12)], actors: [ids.aria, ids.goblin] });
  // Made by hand, as only a player meddling from the console could: the card offers them no Roll button for it.
  await player.eval(async ({ id, goblin, moduleId }) => {
    const roll = await new Roll("20").evaluate();
    await ChatMessage.create({ rolls: [roll], flags: { [moduleId]: { requestRoll: { request: id, actor: goblin, part: 0 } } } });
  }, { id, goblin: ids.goblin, moduleId: MODULE_ID });
  await gm.page.waitForTimeout(1000);
  for ( const session of [gm, player] ) {
    const card = await readCard(session, id);
    assertEqual(row(card, "Goblin").results.length, 0, `the Goblin's results (${session.user})`);
  }
  assertEqual(row(await readCard(gm, id), "Goblin").rollButtons, 1, "the GM's Roll button for the Goblin");
});

test("standard roll: a double click makes one roll", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "standard", parts: [athletics(12)], actors: [ids.aria] });
  await forceDice(player, [d20(7), d20(8)]);
  await rollButton(player, id, "Aria").dblclick({ modifiers: await rollModifiers(player, id, "Aria", true) });
  await waitForRoll(gm, id, ids.aria);
  await player.page.waitForTimeout(1500);
  const rolls = await gm.eval(({ id, moduleId }) => game.messages.filter(m => m.getFlag(moduleId, "requestRoll")?.request === id).length,
    { id, moduleId: MODULE_ID });
  assertEqual(rolls, 1, "roll messages after a double click");
  await player.eval(() => { globalThis.__sttDice.length = 0; });
});

test("standard roll: a plain d6 is rolled straight away and scored against the DC", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "standard", parts: [{ type: "d6", key: null, dc: 4 }], actors: [ids.aria, ids.borin] });
  let card = await readCard(player, id);
  assertEqual([card.title, card.subtitle], ["d6 Roll", "Standard Roll · DC 4"], "heading");

  // No dnd5e roll window for a plain die: a plain click rolls it.
  await forceDice(player, [[5, 6], [2, 6]]);
  await rollButton(player, id, "Aria").click();
  const aria = await waitForRoll(gm, id, ids.aria);
  assertEqual([aria.total, aria.formula, aria.isD20, aria.flavor], [5, "1d6", false, "Standard Roll: d6"], "Aria's d6");
  await rollButton(player, id, "Borin").click();
  await waitForRoll(gm, id, ids.borin);

  await waitForCard(player, id, c => c.rows.every(r => r.results.length), "both results");
  card = await waitForCard(gm, id, c => c.rows.every(r => r.results.length), "both results, for the GM");
  assertEqual(row(card, "Aria").results, [{ text: "5", classes: ["success"] }], "Aria's result");
  assertEqual(row(card, "Borin").results, [{ text: "2", classes: ["failure"] }], "Borin's result");
  assertEqual(row(await readCard(player, id), "Aria").cardButton, false, "a card button on a d6");
});

test("roll-off: other dice can be set against each other, such as a d8 against a d12", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "rolloff", parts: [{ type: "d8", key: null, dc: null }, { type: "d12", key: null, dc: null }],
    sides: [[ids.aria], [ids.borin]], actors: [ids.aria, ids.borin]
  });
  assertEqual((await readCard(player, id)).subtitle, "d8 vs d12", "subtitle");
  await forceDice(player, [[7, 8], [3, 12]]);
  await rollButton(player, id, "Aria").click();
  await waitForRoll(gm, id, ids.aria, 0);
  await rollButton(player, id, "Borin").click();
  const borin = await waitForRoll(gm, id, ids.borin, 1);
  assertEqual([borin.total, borin.formula], [3, "1d12"], "Borin's d12");
  const card = await waitForCard(player, id, c => c.summary, "the winner");
  assertEqual(card.summary, "Aria 7 · Borin 3 Aria wins", "summary, with no NPC to hide");
});

/* -------------------------------------------- */
/*  Skill Challenge                             */
/* -------------------------------------------- */

test("skill challenge: rolls come one at a time and stop once settled", async (ctx) => {
  const { gm, player, ids } = ctx;
  const parts = [athletics(10), { type: "skill", key: "acr", dc: 10 }, { type: "save", key: "wis", dc: 10 }];
  const id = await postRequest(ctx, { mode: "challenge", parts, actors: [ids.aria, ids.borin], successes: 2 });

  let card = await readCard(player, id);
  assertEqual(card.title, "Skill Challenge", "title");
  assertEqual(card.subtitle, "2 of 3 to succeed", "subtitle");
  assertEqual(row(card, "Aria").rollButtons, 1, "one Roll button to start");

  await forceDice(player, [d20(15)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await waitForCard(player, id, c => row(c, "Aria").results.length === 1, "Aria's first roll");
  card = await waitForCard(gm, id, c => row(c, "Aria").results.length === 1, "Aria's first roll, for the GM");
  assertEqual(row(card, "Aria").badge, "1/2", "Aria's badge after one success, for the GM");

  await forceDice(player, [d20(12)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  const second = await waitForRoll(gm, id, ids.aria, 1);
  assertEqual([second.flavor, second.target], ["Dexterity (Acrobatics) Check", null], "Aria's second roll, without its DC");
  card = await waitForCard(gm, id, c => row(c, "Aria").classes.includes("success"), "Aria to pass after two");
  assertEqual(row(card, "Aria").badge, "2/2", "Aria's badge, for the GM");
  card = await waitForCard(player, id, c => row(c, "Aria").results.length === 2, "Aria's second roll, for the player");
  assertEqual(row(card, "Aria").rollButtons + row(card, "Aria").pending, 0, "Aria's third roll offered");

  await forceDice(player, [d20(4), d20(9)]);
  await clickRoll(player, id, "Borin", { fastForward: true });
  await waitForCard(player, id, c => row(c, "Borin").results.length === 1, "Borin's first roll");
  await clickRoll(player, id, "Borin", { fastForward: true });
  card = await waitForCard(gm, id, c => row(c, "Borin").classes.includes("failure"), "Borin to fail after two");
  assertEqual(card.summary, "1 of 2 passed the challenge Show to players", "the GM's summary");
});

test("skill challenge: players see no outcome until the GM shows it", async (ctx) => {
  const { gm, player, ids } = ctx;
  const parts = [athletics(10), athletics(10), athletics(10)];
  const id = await postRequest(ctx, { mode: "challenge", parts, actors: [ids.aria], successes: 2 });
  await forceDice(player, [d20(15), d20(3)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await waitForCard(player, id, c => row(c, "Aria").results.length === 1, "Aria's first roll");
  let card = await readCard(player, id);
  assertEqual([row(card, "Aria").classes, row(card, "Aria").results, row(card, "Aria").badge],
    [[], [{ text: "15", classes: [] }], ""], "Aria's row, for the player, part way through");

  await clickRoll(player, id, "Aria", { fastForward: true });
  await waitForCard(player, id, c => row(c, "Aria").results.length === 2, "Aria's second roll");
  await forceDice(player, [d20(11)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  card = await waitForCard(player, id, c => row(c, "Aria").badge === "Done", "Aria to finish");
  assertEqual(row(card, "Aria").classes, [], "Aria's row, for the player, once finished");
  assertEqual(row(card, "Aria").results.map(r => r.classes), [[], [], []], "Aria's results, for the player");
  assertEqual(card.summary, null, "the player's summary before it is shown");
  const marked = await player.eval(() => [...document.querySelectorAll("#chat .chat-log li.chat-message:not([hidden])")]
    .flatMap(li => [...li.querySelectorAll(".dice-roll.success, .dice-roll.failure")]).length);
  assertEqual(marked, 0, "rolls in the player's chat marked as passing or failing");

  await gm.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-request-reveal`).click();
  card = await waitForCard(player, id, c => c.summary, "the outcome to be shown");
  assertEqual(card.summary, "1 of 1 passed the challenge", "the player's summary once shown");
  assertEqual([row(card, "Aria").classes, row(card, "Aria").badge], [["success"], "2/2"], "Aria's row once shown");
  assertEqual(row(card, "Aria").results.map(r => r.classes[0]), ["success", "failure", "success"], "each roll once shown");
});

test("skill challenge: the third roll decides it", async (ctx) => {
  const { gm, player, ids } = ctx;
  const parts = [athletics(10), athletics(10), { type: "save", key: "wis", dc: 10 }];
  const id = await postRequest(ctx, { mode: "challenge", parts, actors: [ids.aria], successes: 2 });
  await forceDice(player, [d20(15), d20(3), d20(10)]);
  for ( const n of [1, 2, 3] ) {
    await clickRoll(player, id, "Aria", { fastForward: true });
    await waitForCard(player, id, c => row(c, "Aria").results.length === n, `roll ${n}`);
  }
  const card = await waitForCard(gm, id, c => row(c, "Aria").classes.includes("success"), "the challenge to pass");
  assertEqual(row(card, "Aria").results.map(r => r.classes[0]), ["success", "failure", "success"], "each roll");
});

/* -------------------------------------------- */
/*  Team Challenge                              */
/* -------------------------------------------- */

test("team challenge: a natural 1 takes the highest roll out of the average", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "team", parts: [athletics(10)], actors: [ids.aria, ids.borin, ids.goblin] });
  await forceDice(player, [d20(1), d20(15)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await clickRoll(player, id, "Borin", { fastForward: true });
  await forceDice(gm, [d20(10)]);
  await clickRoll(gm, id, "Goblin", { fastForward: true });

  let card = await waitForCard(gm, id, c => c.summary, "the GM's team result");
  assertEqual(card.summary, "Team average 5 · 1 removed Failure Show to players", "the GM's summary");
  assertEqual(row(card, "Borin").classes, ["removed"], "Borin's row, for the GM");

  // Players see the rolls, but not the result or which roll was removed, until the GM shows it.
  card = await waitForCard(player, id, c => c.rows.every(r => r.results.length), "the player to see every roll");
  assertEqual(card.summary, null, "the player's summary before it is shown");
  assertEqual([row(card, "Borin").classes, row(card, "Borin").tooltip], [[], null], "Borin's row before it is shown");

  await revealSummary(gm, id);
  for ( const session of [gm, player] ) {
    card = await waitForCard(session, id, c => c.summary?.startsWith("Team average"), `the team result (${session.user})`);
    assertEqual(row(card, "Borin").classes, ["removed"], "Borin's row");
    assertEqual(row(card, "Borin").tooltip, "Highest roll, removed by Aria's natural 1", "why Borin was removed");
    assertEqual(row(card, "Aria").results[0].classes, ["fumble"], "Aria's natural 1, with no pass or fail mark");
  }
  assertEqual(card.summary, "Team average 5 · 1 removed Failure", "the player's summary once shown");
});

/**
 * Click the GM's Show to players button on a request's summary.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {string} id
 */
async function revealSummary(gm, id) {
  await waitForCard(gm, id, c => c.reveal === "Show to players", "the GM's Show to players button");
  await gm.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-request-reveal`).click();
}

test("team challenge: a natural 20 takes the lowest roll out of the average", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "team", parts: [athletics(15)], actors: [ids.aria, ids.borin, ids.goblin] });
  await forceDice(player, [d20(20), d20(2)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await clickRoll(player, id, "Borin", { fastForward: true });
  await forceDice(gm, [d20(11)]);
  await clickRoll(gm, id, "Goblin", { fastForward: true });
  await revealSummary(gm, id);
  const card = await waitForCard(player, id, c => c.summary, "the team result");
  assertEqual(card.summary, "Team average 15 · 1 removed Success", "summary");
  assertEqual(row(card, "Borin").classes, ["removed"], "Borin's row");
  assertEqual(row(card, "Aria").results[0].classes, ["critical"], "Aria's natural 20");
});

test("team challenge: the GM's summary keeps each word of the result whole beside the Shown button", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "team", parts: [athletics(13)], actors: [ids.aria, ids.borin, ids.goblin] });
  await forceDice(player, [d20(20), d20(4)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await clickRoll(player, id, "Borin", { fastForward: true });
  await forceDice(gm, [d20(11)]);
  await clickRoll(gm, id, "Goblin", { fastForward: true });
  await revealSummary(gm, id);
  await waitForCard(gm, id, c => c.reveal === "Shown", "the result to be shown");
  // A word broken across lines takes more than one line box.
  const broken = await gm.eval(id => {
    const summary = document.querySelector(`#chat .chat-log [data-message-id="${id}"] .stt-request-summary`);
    const words = [];
    for ( const strong of summary.querySelectorAll("strong") ) {
      const text = strong.firstChild;
      for ( const match of text.textContent.matchAll(/\S+/g) ) {
        const range = document.createRange();
        range.setStart(text, match.index);
        range.setEnd(text, match.index + match[0].length);
        const lines = new Set([...range.getClientRects()].map(r => Math.round(r.top)));
        if ( lines.size > 1 ) words.push(match[0]);
      }
    }
    return words;
  }, id);
  assertEqual(broken, [], "words broken across lines in the summary");
});

test("team challenge: the window offers each way of scoring, starting from the setting, and explains the one chosen", async ({ gm }) => {
  const app = await openWindow(gm);
  try {
    await chooseMode(app, "team");
    const scoring = app.locator('select[name="scoring"]');
    assertEqual(await scoring.evaluate(s => [...s.options].map(o => o.value)), ["average", "half", "leader", "weakest"],
      "ways of scoring");
    assertEqual(await scoring.inputValue(), "average", "the scoring the window starts with");
    await scoring.selectOption("half");
    const hint = await app.locator(".stt-request-scoring-hint").textContent();
    assert(hint.includes("at least half"), `The hint doesn't explain Half must succeed: ${hint}`);
    // The scoring is kept when the GM switches mode and back.
    await chooseMode(app, "standard");
    await chooseMode(app, "team");
    assertEqual(await app.locator('select[name="scoring"]').inputValue(), "half", "the scoring after switching mode");
  } finally {
    await gm.eval(() => foundry.applications.instances.get("stt-roll-request")?.close());
  }
});

test("team challenge: led by the best roll, helped by successes and hindered by failures", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "team", scoring: "leader", parts: [athletics(12)], actors: [ids.aria, ids.borin, ids.goblin]
  });
  let card = await readCard(gm, id);
  assertEqual(card.subtitle, "Team Challenge · Leader · DC 12", "the card's subtitle");
  // Every fixture's Athletics is +0, so the leader is the highest total.
  await forceDice(player, [d20(15), d20(8)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await clickRoll(player, id, "Borin", { fastForward: true });
  await forceDice(gm, [d20(13)]);
  await clickRoll(gm, id, "Goblin", { fastForward: true });

  card = await waitForCard(gm, id, c => c.summary, "the GM's team result");
  assertEqual(card.summary, "Aria leads: 15, +1 helped, −1 hindered = 15 Success Show to players", "the GM's summary");
  assertEqual(["Aria", "Borin", "Goblin"].map(name => row(card, name).badge), ["Leader", "−1", "+1"], "each row's note");

  card = await waitForCard(player, id, c => c.rows.every(r => r.results.length), "the player to see every roll");
  assertEqual(card.summary, null, "the player's summary before it is shown");
  assertEqual(card.rows.map(r => r.badge), [null, null, null], "the notes, before the result is shown");

  await revealSummary(gm, id);
  card = await waitForCard(player, id, c => c.summary, "the team result once shown");
  assertEqual(card.summary, "Aria leads: 15, +1 helped, −1 hindered = 15 Success", "the player's summary once shown");
  assertEqual(row(card, "Borin").badge, "−1", "Borin's note once shown");
});

test("team challenge: half must succeed, as the Player's Handbook's group check", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "team", scoring: "half", parts: [athletics(12)], actors: [ids.aria, ids.borin, ids.goblin]
  });
  await forceDice(player, [d20(15), d20(3)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await clickRoll(player, id, "Borin", { fastForward: true });
  await forceDice(gm, [d20(4)]);
  await clickRoll(gm, id, "Goblin", { fastForward: true });
  const card = await waitForCard(gm, id, c => c.summary, "the GM's team result");
  assertEqual(card.summary, "1 of 3 succeeded · 2 needed Failure Show to players", "the GM's summary");
});

/* -------------------------------------------- */
/*  Roll-Off                                    */
/* -------------------------------------------- */

test("roll-off: a d100 against a skill check, the higher total winning", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "rolloff", parts: [{ type: "d100", key: null, dc: null }, athletics(null)],
    sides: [[ids.aria], [ids.goblin]], actors: [ids.aria, ids.goblin]
  });
  let card = await readCard(player, id);
  assertEqual([card.title, card.subtitle], ["Roll-Off", "d100 vs Athletics Check"], "heading");
  assertEqual(card.sides.map(s => s.name), ["Challenger", "Opponent"], "sides");

  // A d100 has no dnd5e roll window: a plain click rolls it.
  await forceDice(player, [d100(73)]);
  await rollButton(player, id, "Aria").click();
  const aria = await waitForRoll(gm, id, ids.aria, 0);
  assertEqual([aria.total, aria.isD20, aria.flavor], [73, false, "Roll-Off: d100"], "Aria's d100");

  await forceDice(gm, [d20(12)]);
  await clickRoll(gm, id, "Goblin", { fastForward: true });
  const goblin = await waitForRoll(gm, id, ids.goblin, 1);
  assertEqual(goblin.flavor, "Strength (Athletics) Check", "the Goblin's check");
  await revealRival(gm, player, id);

  for ( const session of [gm, player] ) {
    card = await waitForCard(session, id, c => c.summary?.startsWith("Aria 73"), `the winner (${session.user})`);
    assertEqual(card.sides.map(s => s.classes[0]), ["success", "failure"], "sides");
  }
  assertEqual(card.summary, "Aria 73 · Goblin 12 Aria wins", "the player's summary");
  assertEqual(row(card, "Aria").cardButton, false, "a card button on a d100 roll-off");
});

/**
 * Show the NPCs' hidden roll-off or Team vs Team rolls to players from the GM's request card, and wait for the player
 * to see them.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {import("./lib/session.mjs").Session} player
 * @param {string} id
 * @param {string} [label="Show NPC roll"]  The GM's button.
 */
async function revealRival(gm, player, id, label="Show NPC roll") {
  await waitForCard(gm, id, c => c.reveal === label, `the GM's ${label} button`);
  await gm.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-request-reveal`).click();
  await waitForCard(player, id, c => c.rows.every(r => r.results.every(p => p.text !== "?")), "the NPC roll to be shown");
}

test("roll-off: the NPC's roll is private to the GM until the GM shows it", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "rolloff", parts: [athletics(null), athletics(null)],
    sides: [[ids.aria], [ids.goblin]], actors: [ids.aria, ids.goblin]
  });

  await forceDice(gm, [d20(16)]);
  await clickRoll(gm, id, "Goblin", { fastForward: true });
  await waitForRoll(gm, id, ids.goblin, 1);
  const whisper = await gm.eval(({ id, moduleId }) => {
    const roll = game.messages.find(m => m.getFlag(moduleId, "requestRoll")?.request === id);
    return { whisper: roll.whisper, gms: game.users.filter(u => u.isGM).map(u => u.id) };
  }, { id, moduleId: MODULE_ID });
  assertEqual(whisper.whisper, whisper.gms, "the Goblin's roll whispered to the GM");
  assertEqual(await player.eval(({ id, moduleId }) => game.messages.find(m => m.getFlag(moduleId, "requestRoll")?.request === id)
    .isContentVisible, { id, moduleId: MODULE_ID }), false, "the Goblin's roll content, for the player");

  let card = await waitForCard(player, id, c => row(c, "Goblin").results.length, "the player to see the Goblin rolled");
  assertEqual(row(card, "Goblin").results, [{ text: "?", classes: [] }], "the Goblin's result, for the player");
  card = await waitForCard(gm, id, c => c.reveal, "the GM's reveal button");
  assertEqual([row(card, "Goblin").results[0].text, card.reveal], ["16", "Show NPC roll"], "the GM's card");

  // The player's own roll stays public.
  await forceDice(player, [d20(11)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  const aria = await waitForRoll(gm, id, ids.aria, 0);
  assertEqual(await gm.eval(id => game.messages.get(id).whisper, aria.id), [], "Aria's roll whisper");

  card = await waitForCard(player, id, c => c.summary, "the player's summary");
  assertEqual(card.summary, "The result is hidden.", "the player's summary before the GM shows the NPC roll");
  card = await waitForCard(gm, id, c => c.summary?.includes("wins"), "the GM's summary");
  assertEqual(card.summary, "Aria 11 · Goblin 16 Goblin wins Show NPC roll", "the GM's summary");

  await revealRival(gm, player, id);
  card = await waitForCard(player, id, c => c.summary?.includes("wins"), "the player's winner");
  assertEqual(card.summary, "Aria 11 · Goblin 16 Goblin wins", "the player's summary once shown");
  assertEqual(row(card, "Goblin").results[0].text, "16", "the Goblin's result once shown");
  await waitForCard(gm, id, c => c.reveal === "NPC roll shown", "the GM's button to show it is shown");

  await gm.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-request-reveal`).click();
  card = await waitForCard(player, id, c => row(c, "Goblin").results[0].text === "?", "the NPC roll to be hidden again");
  assertEqual(card.summary, "The result is hidden.", "the player's summary once hidden again");
});

// Showing the NPC's roll never makes it more public than the request: a private request's roll goes only to the GM and
// the players in the request.
test("roll-off: in a private request, showing the NPC's roll shows it only to the players in it", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "rolloff", parts: [athletics(null), athletics(null)], rollMode: "gm",
    sides: [[ids.aria], [ids.goblin]], actors: [ids.aria, ids.goblin]
  });
  await forceDice(gm, [d20(16)]);
  await clickRoll(gm, id, "Goblin", { fastForward: true });
  const goblin = await waitForRoll(gm, id, ids.goblin, 1);
  await revealRival(gm, player, id);

  // The player can see the roll as soon as it reaches them, which can be before the GM's own copy has caught up.
  const users = await gm.eval(name => ({
    gms: game.users.filter(u => u.isGM).map(u => u.id),
    player: game.users.getName(name).id
  }), PLAYER_USER);
  await waitFor(gm, ({ id, whisper }) => game.messages.get(id).whisper.join() === whisper.join(),
    { id: goblin.id, whisper: [...users.gms, users.player] }, "the Goblin's roll to be shown only to the GM and Aria's player");

  await gm.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-request-reveal`).click();
  await waitFor(gm, ({ id, gms }) => game.messages.get(id).whisper.every(u => gms.includes(u)), { id: goblin.id, gms: users.gms },
    "the Goblin's roll to be hidden again");
  const card = await waitForCard(player, id, c => row(c, "Goblin").results[0]?.text === "?", "the NPC roll to be hidden again");
  assertEqual(row(card, "Goblin").results[0].text, "?", "the Goblin's result once hidden again");
});

test("roll-off: equal d20s tie, and a card can be played on a plain d20", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "rolloff", parts: [{ type: "d20", key: null, dc: null }, { type: "d20", key: null, dc: null }],
    sides: [[ids.aria], [ids.goblin]], actors: [ids.aria, ids.goblin]
  });
  await forceDice(player, [d20(9)]);
  await clickRoll(player, id, "Aria");
  const aria = await waitForRoll(gm, id, ids.aria, 0);
  assertEqual([aria.isD20, aria.flavor, aria.total], [true, "Roll-Off: d20", 9], "Aria's d20");
  await forceDice(gm, [d20(9)]);
  await clickRoll(gm, id, "Goblin", { fastForward: true });
  await waitForRoll(gm, id, ids.goblin, 1);
  await revealRival(gm, player, id);

  let card = await waitForCard(player, id, c => c.summary?.includes("Tie"), "the tie");
  assertEqual(card.summary, "Aria 9 · Goblin 9 Tie", "summary");
  assertEqual(card.summaryClasses, ["tie"], "summary style");
  assertEqual(row(card, "Aria").cardButton, true, "a card button on Aria's plain d20");

  await forceDice(player, [d20(17)]);
  const offered = await playCard(player, id, "Aria", "Advantage");
  assert(offered.includes("Lucky"), `Luck was not offered on a plain d20: ${offered.join(", ")}`);
  card = await waitForCard(player, id, c => c.summary?.includes("Aria wins"), "Advantage to win it");
  assertEqual(card.summary, "Aria 17 · Goblin 9 Aria wins", "summary after Advantage");
});

/* -------------------------------------------- */
/*  Team vs Team                                */
/* -------------------------------------------- */

test("team vs team: each team pooled with the 1 and 20 rule, the higher average winning", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "versus", parts: [{ type: "d20", key: null, dc: null }, athletics(null)],
    sides: [[ids.aria, ids.borin], [ids.goblin]], actors: [ids.aria, ids.borin, ids.goblin]
  });
  await forceDice(player, [d20(20), d20(5)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await clickRoll(player, id, "Borin", { fastForward: true });
  await forceDice(gm, [d20(12)]);
  await clickRoll(gm, id, "Goblin", { fastForward: true });
  await waitForRoll(gm, id, ids.goblin, 1);
  await revealRival(gm, player, id, "Show NPC rolls");

  const card = await waitForCard(player, id, c => c.summary?.includes("win"), "the winner");
  assertEqual(card.sides.map(s => [s.name, s.score, s.classes[0]]), [["Players", "20", "success"], ["NPCs", "12", "failure"]],
    "sides");
  assertEqual(card.summary, "Players 20 · NPCs 12 Players win", "summary");
  assertEqual(row(card, "Borin").classes, ["removed"], "Borin's low roll, removed by Aria's natural 20");
});

test("team vs team: the NPCs' rolls are private to the GM until the GM shows them", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "versus", parts: [athletics(null), athletics(null)],
    sides: [[ids.aria], [ids.goblin]], actors: [ids.aria, ids.goblin]
  });
  await forceDice(player, [d20(11)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await forceDice(gm, [d20(16)]);
  await clickRoll(gm, id, "Goblin", { fastForward: true });
  await waitForRoll(gm, id, ids.goblin, 1);

  let card = await waitForCard(player, id, c => c.summary, "the player's summary");
  assertEqual(row(card, "Goblin").results, [{ text: "?", classes: [] }], "the Goblin's result, for the player");
  assertEqual(card.sides.map(s => s.score), ["11", null], "the team scores, for the player");
  assertEqual(card.summary, "The result is hidden.", "the player's summary before the GM shows the NPC rolls");
  card = await waitForCard(gm, id, c => c.summary?.includes("win"), "the GM's summary");
  assertEqual(card.summary, "Players 11 · NPCs 16 NPCs win Show NPC rolls", "the GM's summary");

  await revealRival(gm, player, id, "Show NPC rolls");
  card = await waitForCard(player, id, c => c.summary?.includes("win"), "the player's winner");
  assertEqual(card.summary, "Players 11 · NPCs 16 NPCs win", "the player's summary once shown");
  await waitForCard(gm, id, c => c.reveal === "NPC rolls shown", "the GM's button to show they are shown");

  await gm.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-request-reveal`).click();
  card = await waitForCard(player, id, c => row(c, "Goblin").results[0].text === "?", "the NPC rolls to be hidden again");
  assertEqual(card.summary, "The result is hidden.", "the player's summary once hidden again");
});

/* -------------------------------------------- */
/*  Divine Intervention                         */
/* -------------------------------------------- */

/**
 * Click Roll, pick a run of numbers in the grid, and roll the d100.
 * @param {import("./lib/session.mjs").Session} session
 * @param {string} id
 * @param {string} name
 * @param {number} number  The number clicked in the grid.
 * @returns {Promise<string>}  The picker's "You need …" line.
 */
async function pickAndRoll(session, id, name, number) {
  await rollButton(session, id, name).click();
  const dialog = session.page.locator(".stt-divine-dialog.application");
  await dialog.waitFor({ timeout: 10_000 });
  const roll = dialog.locator('button[data-action="roll"]');
  assertEqual(await roll.isDisabled(), true, "Roll d100 before picking");
  await dialog.locator(`.stt-divine-number[data-number="${number}"]`).click();
  const choice = (await dialog.locator(".stt-divine-choice").textContent()).trim();
  await roll.click();
  return choice;
}

test("divine intervention: the player picks 16 numbers, then rolls the d100 into them", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "divine", range: 16, parts: [{ type: "d100", key: null, dc: null }], actors: [ids.aria]
  });
  let card = await readCard(player, id);
  assertEqual([card.title, card.subtitle], ["Divine Intervention", "16 numbers in a row on a d100"], "heading");

  await forceDice(player, [d100(90)]);
  // Near the top the run is moved down so it still ends at 100.
  assertEqual(await pickAndRoll(player, id, "Aria", 95), "You need 85–100.", "the picked range");
  const roll = await waitForRoll(gm, id, ids.aria);
  assertEqual([roll.total, roll.flag.range], [90, { start: 85, end: 100 }], "the d100 and its range");
  assertEqual(roll.flavor, "Divine Intervention: d100, needing 85–100", "the roll's flavor");

  card = await waitForCard(player, id, c => c.summary, "the answer");
  assertEqual(row(card, "Aria").range, "85–100", "the range on the card");
  assertEqual(row(card, "Aria").results[0], { text: "90", classes: ["success"] }, "the result");
  assertEqual(card.summary, "The gods answer", "summary");
});

test("divine intervention: cancelling the picker rolls nothing", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "divine", range: 16, parts: [{ type: "d100", key: null, dc: null }], actors: [ids.aria]
  });
  await rollButton(player, id, "Aria").click();
  const dialog = player.page.locator(".stt-divine-dialog.application");
  await dialog.waitFor({ timeout: 10_000 });
  await dialog.locator('button[data-action="cancel"]').click();
  await player.page.waitForTimeout(1000);
  assertEqual(await gm.eval(() => game.messages.contents.filter(m => m.rolls.length).length), 0, "roll messages");
  assertEqual(row(await readCard(player, id), "Aria").rollButtons, 1, "Aria's Roll button");
});

test("divine intervention: Luck rerolls a miss, and only Advantage and Luck are offered", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "divine", range: 16, parts: [{ type: "d100", key: null, dc: null }], actors: [ids.aria]
  });
  await forceDice(player, [d100(10)]);
  await pickAndRoll(player, id, "Aria", 40);
  await waitForCard(player, id, c => row(c, "Aria").results[0]?.classes.includes("failure"), "the miss");

  await forceDice(player, [d100(45)]);
  const offered = await playCard(player, id, "Aria", "Lucky");
  assertEqual([...offered].sort(), ["Advantage", "Lucky"], "cards offered on the d100");
  const card = await waitForCard(player, id, c => c.summary?.includes("answer") && row(c, "Aria").results[0].text === "45",
    "the reroll");
  assertEqual(card.summary, "The gods answer", "summary after Luck");
  const log = await gm.eval(({ id, moduleId }) => game.messages.find(m => m.getFlag(moduleId, "requestRoll")?.request === id)
    .getFlag(moduleId, "log").map(e => e.text), { id, moduleId: MODULE_ID });
  assertEqual(log, ["Lucky: rerolled the d100: 10 → 45"], "the card's note on the roll");
});

test("divine intervention: Advantage keeps a second d100 that lands in range", async (ctx) => {
  const { player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "divine", range: 16, parts: [{ type: "d100", key: null, dc: null }], actors: [ids.aria]
  });
  await forceDice(player, [d100(10)]);
  await pickAndRoll(player, id, "Aria", 40);
  await waitForCard(player, id, c => row(c, "Aria").results.length, "the miss");
  await forceDice(player, [d100(50)]);
  await playCard(player, id, "Aria", "Advantage");
  let card = await waitForCard(player, id, c => row(c, "Aria").results[0].text === "50", "Advantage");
  assertEqual(card.summary, "The gods answer", "summary after Advantage");
  card = await readCard(player, id);
  const offered = await player.eval(({ id }) => document.querySelector(`#chat .chat-log [data-message-id="${id}"] .stt-card-button`)
    ? "button" : "none", { id });
  assert(offered === "button", "Luck should still be playable after Advantage.");
});

test("divine intervention: Advantage keeps the first d100 when the second misses", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, {
    mode: "divine", range: 16, parts: [{ type: "d100", key: null, dc: null }], actors: [ids.aria]
  });
  await forceDice(player, [d100(45)]);
  await pickAndRoll(player, id, "Aria", 40);
  await waitForCard(player, id, c => row(c, "Aria").results.length, "the hit");
  await forceDice(player, [d100(99)]);
  await playCard(player, id, "Aria", "Advantage");
  await waitFor(gm, ({ id, moduleId }) => game.messages.find(m => m.getFlag(moduleId, "requestRoll")?.request === id)
    ?.getFlag(moduleId, "log")?.length, { id, moduleId: MODULE_ID }, "the card's note");
  const card = await readCard(player, id);
  assertEqual(row(card, "Aria").results[0].text, "45", "the kept d100");
});

/* -------------------------------------------- */
/*  Hero Cards on Requested Rolls           */
/* -------------------------------------------- */

test("cards: Advantage on a failed check updates the request card", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "standard", parts: [athletics(12)], actors: [ids.aria, ids.borin] });
  await forceDice(player, [d20(4), d20(6)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await clickRoll(player, id, "Borin", { fastForward: true });
  let card = await waitForCard(player, id, c => c.rows.every(r => r.results.length), "both results");
  assertEqual(row(card, "Aria").cardButton, true, "Aria's card button");
  assertEqual(row(card, "Borin").cardButton, false, "Borin, who has no cards");

  await forceDice(player, [d20(18)]);
  await playCard(player, id, "Aria", "Advantage");
  await waitForCard(player, id, c => row(c, "Aria").results[0].text === "18", "Advantage");
  card = await waitForCard(gm, id, c => row(c, "Aria").results[0].text === "18", "Advantage, for the GM");
  assertEqual(row(card, "Aria").results[0].classes, ["success"], "Aria's result after Advantage");
});

test("cards: Indomitable is offered on a failed requested save once the GM shows the result, and never on a pass", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "standard", parts: [{ type: "save", key: "wis", dc: 15 }], actors: [ids.aria] });
  await forceDice(player, [d20(16)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await waitForCard(player, id, c => row(c, "Aria").results.length, "the passed save");
  // Advantage's second d20 is forced too, and waited for, so it cannot take a die meant for the next roll.
  await forceDice(player, [d20(3)]);
  const offered = await playCard(player, id, "Aria", "Advantage");
  assert(!offered.includes("Indomitable"), `Indomitable was offered on a passed save: ${offered.join(", ")}`);
  await waitFor(player, ({ id, moduleId }) => game.messages.find(m => m.getFlag(moduleId, "requestRoll")?.request === id)
    ?.getFlag(moduleId, "log")?.length, { id, moduleId: MODULE_ID }, "Advantage to be recorded");

  const failed = await postRequest(ctx, { mode: "standard", parts: [{ type: "save", key: "wis", dc: 15 }], actors: [ids.aria] });
  await forceDice(player, [d20(6)]);
  await clickRoll(player, failed, "Aria", { fastForward: true });
  await waitForCard(player, failed, c => row(c, "Aria").results.length, "the failed save");

  // Before the GM shows the result, offering Indomitable would tell the player they failed.
  const notYet = await cardsOnRow(player, failed, "Aria");
  assert(notYet.includes("Lucky"), `The card chooser did not open: ${notYet.join(", ")}`);
  assert(!notYet.includes("Indomitable"), `Indomitable was offered before the result was shown: ${notYet.join(", ")}`);

  await gm.page.locator(`#chat .chat-log [data-message-id="${failed}"] .stt-request-reveal`).click();
  await waitForCard(player, failed, c => c.summary, "the result to be shown");
  await forceDice(player, [d20(19)]);
  await playCard(player, failed, "Aria", "Indomitable");
  await waitForCard(player, failed, c => row(c, "Aria").results[0].text === "19", "Indomitable's reroll");
});

/* -------------------------------------------- */
/*  Attached Rolls                              */
/* -------------------------------------------- */

/**
 * @param {import("./lib/session.mjs").Session} session
 * @param {string} id  A roll message's ID.
 * @returns {Promise<boolean>}  Whether the roll's own message shows in the user's chat log.
 */
function rollMessageShown(session, id) {
  return session.eval(id => {
    const li = document.querySelector(`#chat .chat-log li.chat-message[data-message-id="${id}"]`);
    return !!li && li.checkVisibility();
  }, id);
}

test("attached rolls: on by default, the rolls are hidden from chat and shown on the request card", async (ctx) => {
  const { gm, player, ids } = ctx;
  const setting = await gm.eval(moduleId => {
    const s = game.settings.settings.get(`${moduleId}.attachRolls`);
    return { config: s?.config, scope: s?.scope, default: s?.default, value: game.settings.get(moduleId, "attachRolls") };
  }, MODULE_ID);
  assertEqual(setting, { config: false, scope: "world", default: true, value: true }, "the setting");

  const id = await postRequest(ctx, { mode: "standard", parts: [athletics(12)], actors: [ids.aria] });
  await forceDice(player, [d20(4)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  const roll = await waitForRoll(gm, id, ids.aria);
  await waitForCard(player, id, c => row(c, "Aria").results.length, "Aria's result");
  for ( const session of [gm, player] ) {
    assertEqual(await rollMessageShown(session, roll.id), false, `Aria's roll message in chat (${session.user})`);
  }

  // Clicking the result opens its dice under the row.
  await player.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-request-result.expandable`).click();
  const detail = player.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-request-roll-detail`);
  await detail.locator(".dice-tooltip").waitFor({ timeout: 5000 });
  assertEqual((await detail.locator(".stt-request-roll-formula").textContent()).trim(), "1d20 + 0 = 4", "the formula");

  // A card played on the roll is noted under the row, and the open dice stay open through the redraw.
  await forceDice(player, [d20(13)]);
  await playCard(player, id, "Aria", "Lucky");
  const card = await waitForCard(player, id, c => row(c, "Aria").results[0].text === "13", "Luck's reroll");
  assert(card, "The card did not update.");
  const note = await player.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-request-details .stt-card-log`)
    .textContent();
  assertEqual(note.replace(/\s+/g, " ").trim(), "Lucky: rerolled the d20 (4 → 13): 4 → 13", "the card's note, with no Hero Cards label");
  assertEqual(await detail.count(), 1, "the dice breakdown after the redraw");
});

test("attached rolls: deleting the request card shows its rolls in chat again", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "standard", parts: [athletics(12)], actors: [ids.aria] });
  await forceDice(player, [d20(4)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  const roll = await waitForRoll(gm, id, ids.aria);
  await waitForCard(player, id, c => row(c, "Aria").results.length, "Aria's result");
  await gm.eval(id => game.messages.get(id).delete(), id);
  for ( const session of [gm, player] ) {
    await waitFor(session, id => {
      const li = document.querySelector(`#chat .chat-log li.chat-message[data-message-id="${id}"]`);
      return !!li && li.checkVisibility();
    }, roll.id, "Aria's roll message to show in chat");
  }
});

test("attached rolls: turning the setting off shows rolls already attached", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "standard", parts: [athletics(12)], actors: [ids.aria] });
  await forceDice(player, [d20(4)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  const roll = await waitForRoll(gm, id, ids.aria);
  await waitForCard(player, id, c => row(c, "Aria").results.length, "Aria's result");
  assertEqual(await rollMessageShown(gm, roll.id), false, "Aria's roll message while attached");
  await gm.eval(moduleId => game.settings.set(moduleId, "attachRolls", false), MODULE_ID);
  for ( const session of [gm, player] ) {
    await waitFor(session, id => {
      const li = document.querySelector(`#chat .chat-log li.chat-message[data-message-id="${id}"]`);
      return !!li && li.checkVisibility();
    }, roll.id, "Aria's roll message to show in chat");
  }
});

test("attached rolls: turned off, each roll keeps its own chat message", async (ctx) => {
  const { gm, player, ids } = ctx;
  await gm.eval(moduleId => game.settings.set(moduleId, "attachRolls", false), MODULE_ID);
  await waitFor(player, moduleId => game.settings.get(moduleId, "attachRolls") === false, MODULE_ID, "the setting");
  const id = await postRequest(ctx, { mode: "standard", parts: [athletics(12)], actors: [ids.aria] });
  await forceDice(player, [d20(9)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  const roll = await waitForRoll(gm, id, ids.aria);
  await waitForCard(player, id, c => row(c, "Aria").results.length, "Aria's result");
  for ( const session of [gm, player] ) {
    assertEqual(await rollMessageShown(session, roll.id), true, `Aria's roll message in chat (${session.user})`);
  }
  const expandable = await player.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-request-result.expandable`).count();
  assertEqual(expandable, 0, "results that open their dice");
});

/* -------------------------------------------- */
/*  Choice of Rolls                             */
/* -------------------------------------------- */

test("choice of rolls: the request window offers alternatives where the mode allows them", async ({ gm }) => {
  const app = await openWindow(gm);
  const addButton = app.locator('[data-action="addChoice"][data-field="standard"]');
  const alternatives = () => app.evaluate(el => [...el.querySelectorAll('select[name*=".alternatives."]')]
    .map(s => `${s.name.replace(/\.roll$/, "")}=${s.value}`));
  const choiceDCs = () => app.evaluate(el => [...el.querySelectorAll('input[name*=".alternatives."][name$=".dc"]')]
    .map(i => i.value));
  try {
    await chooseMode(app, "standard");
    await app.locator('select[name="standard.roll"]').selectOption("skill.ath");
    await app.locator('input[name="standard.dc"]').fill("15");
    await addButton.click();
    // The first roll not already offered.
    assertEqual(await alternatives(), ["standard.alternatives.0=skill.acr"], "the first alternative");
    // Each choice has a DC of its own, starting as the roll's.
    assertEqual(await choiceDCs(), ["15"], "the first alternative's DC");
    await app.locator('select[name="standard.alternatives.0.roll"]').selectOption("save.str");
    await app.locator('input[name="standard.alternatives.0.dc"]').fill("10");
    await addButton.click();
    assertEqual(await alternatives(), ["standard.alternatives.0=save.str", "standard.alternatives.1=skill.acr"],
      "a second alternative, keeping the first");
    await addButton.click();
    assertEqual(await addButton.isDisabled(), true, "the add button once there are four rolls to choose from");
    await app.locator('[data-action="removeChoice"][data-field="standard"][data-index="1"]').click();
    assertEqual(await alternatives(), ["standard.alternatives.0=save.str", "standard.alternatives.1=skill.ani"],
      "alternatives after removing the second");

    // A contest has no choices, and the standard roll keeps its own when the mode changes back.
    await chooseMode(app, "rolloff");
    assertEqual(await app.locator('[data-action="addChoice"]').count(), 0, "add buttons in a roll-off");
    await chooseMode(app, "challenge");
    assertEqual(await app.locator('[data-action="addChoice"]').count(), 3, "add buttons in a skill challenge");
    // A Team Challenge averages its rolls against one DC, so its choices have none of their own.
    await chooseMode(app, "team");
    await app.locator('[data-action="addChoice"]').first().click();
    assertEqual([(await alternatives()).length, (await choiceDCs()).length], [1, 0], "a team challenge's choices and DCs");
    await chooseMode(app, "standard");
    assertEqual((await alternatives())[0], "standard.alternatives.0=save.str", "alternatives after switching back");
    assertEqual(await choiceDCs(), ["10", "15"], "the choices' DCs after switching back");

    await app.locator('button[type="submit"]').click();
    const request = await waitFor(gm, moduleId => game.messages.contents.at(-1)?.getFlag(moduleId, "request") ?? null,
      MODULE_ID, "the request message");
    assertEqual(request.parts, [{
      type: "skill", key: "ath", dc: 15,
      alternatives: [{ type: "save", key: "str", dc: 10 }, { type: "skill", key: "ani", dc: 15 }]
    }], "the parts sent");
  } finally {
    await gm.eval(() => foundry.applications.instances.get("stt-roll-request")?.close());
  }
});

test("choice of rolls: the player picks one, which is rolled and scored against the shared DC", async (ctx) => {
  const { gm, player, ids } = ctx;
  const part = { type: "skill", key: "ath", dc: 12, alternatives: [{ type: "save", key: "str" }] };
  const id = await postRequest(ctx, { mode: "standard", parts: [part], actors: [ids.aria] });
  assertEqual((await readCard(player, id)).title, "Athletics Check or Strength Save", "the title");

  await forceDice(player, [d20(14)]);
  await rollButton(player, id, "Aria").click();
  const dialog = player.page.locator(".stt-choice-dialog");
  await dialog.waitFor({ timeout: 10_000 });
  const labels = await dialog.locator(".form-footer button").allTextContents();
  assertEqual(labels.map(l => l.trim()), ["Athletics Check · DC 12", "Strength Save · DC 12"], "the rolls offered");
  await dialog.locator('button[data-action="choice1"]').click({ modifiers: await rollModifiers(player, id, "Aria", true) });

  const roll = await waitForRoll(gm, id, ids.aria);
  assertEqual([roll.type, roll.total, roll.flag.choice], ["save", 14, 1], "Aria's roll");
  const card = await waitForCard(gm, id, c => row(c, "Aria").results.length, "Aria's result");
  assertEqual(row(card, "Aria").results, [{ text: "14", classes: ["success"] }], "Aria's result");
  const tooltip = await gm.eval(id => document.querySelector(`#chat .chat-log [data-message-id="${id}"] .stt-request-result`)
    ?.dataset.tooltipText, id);
  assert(tooltip?.startsWith("Strength Save: 14"), `The result doesn't say which roll was chosen: ${tooltip}`);
});

test("choice of rolls: each choice is scored against its own DC, which the GM can change", async (ctx) => {
  const { gm, player, ids } = ctx;
  const part = { type: "check", key: "dex", dc: 10, alternatives: [{ type: "check", key: "str", dc: 15 }] };
  const id = await postRequest(ctx, { mode: "standard", parts: [part], actors: [ids.aria, ids.borin], showDC: false });
  const steps = session => session.eval(id => document.querySelector(`#chat .chat-log [data-message-id="${id}"] .stt-request-steps`)
    ?.textContent.replace(/\s+/g, " ").trim(), id);
  assertEqual(await steps(gm), "Dexterity Check DC 10 or Strength Check DC 15", "the GM's list of choices");
  assertEqual(await steps(player), "Dexterity Check DC ? or Strength Check DC ?", "the player's list of choices");
  assertEqual((await readCard(gm, id)).subtitle, "Standard Roll", "the subtitle, without a DC");

  // The player sees each choice's DC as far as the request shows it.
  await rollButton(player, id, "Aria").click();
  const dialog = player.page.locator(".stt-choice-dialog");
  await dialog.waitFor({ timeout: 10_000 });
  const labels = await dialog.locator(".form-footer button").allTextContents();
  assertEqual(labels.map(l => l.trim()), ["Dexterity Check · DC ?", "Strength Check · DC ?"], "the rolls offered");
  await forceDice(player, [d20(12)]);
  await dialog.locator('button[data-action="choice1"]').click({ modifiers: await rollModifiers(player, id, "Aria", true) });
  await dialog.waitFor({ state: "detached", timeout: 10_000 });
  await waitForRoll(gm, id, ids.aria);
  await rollButton(player, id, "Borin").click();
  await forceDice(player, [d20(12)]);
  await player.page.locator('.stt-choice-dialog button[data-action="choice0"]').click({ modifiers: await rollModifiers(player, id, "Borin", true) });
  await waitForRoll(gm, id, ids.borin);

  // 12 beats Dexterity's DC 10, but not Strength's DC 15.
  let card = await waitForCard(gm, id, c => c.rows.every(r => r.results.length), "both results");
  assertEqual(card.rows.map(r => [r.name, r.classes]), [["Aria", ["failure"]], ["Borin", ["success"]]], "the rows");
  assertEqual(card.summary, "1 of 2 succeeded Show to players", "the summary");

  // Lowering Strength's DC scores Aria's roll again.
  await gm.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-request-dc-edit`).nth(1).click();
  const edit = gm.page.locator(".stt-dc-dialog");
  await edit.waitFor({ timeout: 10_000 });
  assertEqual(await edit.locator('input[name="dc"]').inputValue(), "15", "the DC shown for Strength");
  await edit.locator('input[name="dc"]').fill("12");
  await edit.locator('button[data-action="ok"]').click();
  card = await waitForCard(gm, id, c => row(c, "Aria").classes.includes("success"), "Aria to succeed");
  assertEqual(await steps(gm), "Dexterity Check DC 10 or Strength Check DC 12", "the list after the change");
  const parts = await gm.eval(({ id, moduleId }) => game.messages.get(id).getFlag(moduleId, "request").parts, { id, moduleId: MODULE_ID });
  assertEqual(parts[0].alternatives, [{ type: "check", key: "str", dc: 12 }], "the alternative's DC");
  assertEqual(parts[0].dc, 10, "the part's own DC, unchanged");
});

test("choice of rolls: closing the choice makes no roll", async (ctx) => {
  const { player, ids } = ctx;
  const part = { type: "skill", key: "ath", dc: 12, alternatives: [{ type: "save", key: "str" }] };
  const id = await postRequest(ctx, { mode: "standard", parts: [part], actors: [ids.aria] });
  await rollButton(player, id, "Aria").click();
  const dialog = player.page.locator(".stt-choice-dialog");
  await dialog.waitFor({ timeout: 10_000 });
  await dialog.locator('[data-action="close"]').click();
  await dialog.waitFor({ state: "detached", timeout: 10_000 });
  await player.page.waitForTimeout(500);
  const card = await readCard(player, id);
  assertEqual([row(card, "Aria").results.length, row(card, "Aria").rollButtons], [0, 1], "Aria's row");
});

/* -------------------------------------------- */
/*  Changing the DC                             */
/* -------------------------------------------- */

/**
 * Open the DC dialog from one of the request card's DC buttons, as the GM would.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {string} id
 * @param {number} [index=0]  Which DC button on the card.
 * @returns {Promise<import("playwright").Locator>}  The dialog.
 */
async function openDCDialog(gm, id, index = 0) {
  await gm.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-request-dc-edit`).nth(index).click();
  const dialog = gm.page.locator(".stt-dc-dialog");
  await dialog.waitFor({ timeout: 10_000 });
  return dialog;
}

/**
 * Change a DC from the request card.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {string} id
 * @param {string} dc
 * @param {number} [index=0]
 */
async function changeDC(gm, id, dc, index = 0) {
  const dialog = await openDCDialog(gm, id, index);
  await dialog.locator('input[name="dc"]').fill(dc);
  await dialog.locator('button[data-action="ok"]').click();
  await dialog.waitFor({ state: "detached", timeout: 10_000 });
}

test("changing the DC: the GM changes it on the card, and rolls already made are scored again", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "standard", parts: [athletics(15)], actors: [ids.aria], showDC: true });
  assertEqual(await player.page.locator(`#chat .chat-log [data-message-id="${id}"] .stt-request-dc-edit`).count(), 0,
    "the player's DC buttons");
  await forceDice(player, [d20(12)]);
  await clickRoll(player, id, "Aria", { fastForward: true });
  await waitForCard(gm, id, c => row(c, "Aria").results[0]?.classes.includes("failure"), "Aria failing DC 15");

  await changeDC(gm, id, "10");
  await waitForCard(gm, id, c => row(c, "Aria").results[0]?.classes.includes("success"), "Aria passing DC 10");
  const card = await waitForCard(player, id, c => c.subtitle === "Standard Roll · DC 10", "the player's new DC");
  assertEqual(card.summary, null, "the player's summary, still hidden");

  // Cleared, the request has no DC, so no one passes or fails.
  await changeDC(gm, id, "");
  await waitForCard(gm, id, c => (c.subtitle === "Standard Roll · No DC") && !row(c, "Aria").results[0].classes.length,
    "no DC");
});

test("changing the DC: each step of a skill challenge has its own, which can't be left blank", async (ctx) => {
  const { gm, ids } = ctx;
  const parts = [athletics(10), athletics(15), athletics(20)];
  const id = await postRequest(ctx, { mode: "challenge", parts, actors: [ids.goblin], successes: 2 });
  const dcs = () => gm.eval(({ id, moduleId }) => game.messages.get(id).getFlag(moduleId, "request").parts.map(p => p.dc),
    { id, moduleId: MODULE_ID });
  await changeDC(gm, id, "13", 1);
  await waitFor(gm, ({ id, moduleId }) => game.messages.get(id).getFlag(moduleId, "request").parts[1].dc === 13,
    { id, moduleId: MODULE_ID }, "the second step's DC to change");
  assertEqual(await dcs(), [10, 13, 20], "the DCs once the second is changed");

  const dialog = await openDCDialog(gm, id, 0);
  await dialog.locator('input[name="dc"]').fill("");
  await dialog.locator('button[data-action="ok"]').click();
  await gm.page.waitForTimeout(500);
  if ( await dialog.count() ) await dialog.locator('[data-action="close"]').click();
  assertEqual(await dcs(), [10, 13, 20], "the DCs after trying to clear one");
});

test("changing the DC: a skill challenge roll made after a new DC settled it is shown as not counted", async (ctx) => {
  const { gm, player, ids } = ctx;
  const id = await postRequest(ctx, { mode: "challenge", parts: [athletics(10), athletics(10), athletics(10)],
    actors: [ids.aria], successes: 2 });
  await forceDice(player, [d20(15), d20(3), d20(15)]);
  for ( const n of [1, 2, 3] ) {
    await clickRoll(player, id, "Aria", { fastForward: true });
    await waitForCard(player, id, c => row(c, "Aria").results.length === n, `roll ${n}`);
  }
  await waitForCard(gm, id, c => row(c, "Aria").classes.includes("success"), "the challenge to pass");

  // Failing the first step too, two failures now settle it before the third roll.
  await changeDC(gm, id, "30", 0);
  const card = await waitForCard(gm, id, c => row(c, "Aria").classes.includes("failure"), "the challenge to fail");
  assertEqual(row(card, "Aria").results.map(r => r.classes), [["failure"], ["failure"], ["uncounted"]], "each roll");
  assertEqual(row(card, "Aria").rollButtons, 0, "Aria's Roll buttons");

  // A card is played on the last roll that counts, not the uncounted one, even before the player is shown which.
  await waitFor(player, ({ id, moduleId }) => game.messages.get(id).getFlag(moduleId, "request").parts[0].dc === 30,
    { id, moduleId: MODULE_ID }, "the player to see the new DC");
  await forceDice(player, [d20(20)]);
  await playCard(player, id, "Aria", "Advantage");
  const after = await waitForCard(gm, id, c => row(c, "Aria").classes.includes("success"), "Advantage to win it back");
  assert(row(after, "Aria").results[1].classes.includes("success"), "Advantage was not played on the second roll.");
  assert(!row(after, "Aria").results[2].classes.includes("uncounted"), "The third roll still isn't counted.");
});
