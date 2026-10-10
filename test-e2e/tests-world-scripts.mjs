/**
 * End-to-end tests for the settings menus and the Gameplay Enhancements: Bloodied Token Tint, Fade Unprepared Spells,
 * Item Rarity Colours, Chat Button Labels and One-Tab Activities.
 */

import { MODULE_ID } from "./config.mjs";
import { assert, assertEqual, test, waitFor } from "./lib/harness.mjs";

const MENUS = {
  heroCards: { id: "stt-settings-hero-cards", settings: ["lockNaturals", "showPlayedCards"] },
  diceRolling: {
    id: "stt-settings-dice-rolling",
    settings: [
      "markNaturals", "naturalSaves", "naturalSaveOutcomes", "naturalInitiative", "naturalChecks", "naturalRollOff"
    ]
  },
  rollRequests: {
    id: "stt-settings-roll-requests",
    settings: ["defaultDC", "showDCDefault", "teamScoring", "attachRolls", "popupPlayers", "popupGM", "deathSavePrompt"]
  },
  worldScripts: {
    id: "stt-settings-world-scripts",
    settings: ["bloodiedTint", "fadeUnprepared", "rarityColours", "chatButtonLabels", "oneTabActivities", "welcomeCards"]
  }
};

/**
 * Set a module setting as the GM and wait for the other user to see it.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {import("./lib/session.mjs").Session} player
 * @param {string} key
 * @param {*} value
 */
async function setSetting(gm, player, key, value) {
  await gm.eval(({ moduleId, key, value }) => game.settings.set(moduleId, key, value), { moduleId: MODULE_ID, key, value });
  await waitFor(player, ({ moduleId, key, value }) => game.settings.get(moduleId, key) === value,
    { moduleId: MODULE_ID, key, value }, `${key} to reach the player`);
}

/**
 * Give Aria some items for a test, as the GM. They are deleted again by `removeItems`.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {object[]} items  Item data.
 * @returns {Promise<string[]>}  The new items' IDs, in the order given.
 */
function giveItems(gm, items) {
  return gm.eval(async items => {
    // The created documents aren't always returned in the order given, so each is found again by its name.
    const created = await game.actors.getName("Aria").createEmbeddedDocuments("Item", items);
    return items.map(data => created.find(i => i.name === data.name).id);
  }, items);
}

/**
 * @param {import("./lib/session.mjs").Session} gm
 * @param {string[]} ids  Items of Aria's to delete.
 */
function removeItems(gm, ids) {
  return gm.eval(ids => game.actors.getName("Aria").deleteEmbeddedDocuments("Item", ids), ids);
}

/**
 * Open Aria's sheet in a user's browser, and return the classes on each of the given items' rows.
 * @param {import("./lib/session.mjs").Session} session
 * @param {string[]} ids
 * @param {object} [options]
 * @param {boolean} [options.render=true]  Draw the sheet first. Off, the rows are read as they are, so a redraw the
 *                                         test is waiting on isn't overlapped by another.
 * @returns {Promise<Record<string, string[]>>}
 */
async function rowClasses(session, ids, { render = true } = {}) {
  if ( render ) await session.eval(() => game.actors.getName("Aria").sheet.render({ force: true }));
  await waitFor(session, ids => {
    const sheet = game.actors.getName("Aria").sheet;
    return sheet.rendered && ids.every(id => sheet.element.querySelector(`.item[data-item-id="${id}"]`));
  }, ids, "Aria's sheet with every item's row");
  return session.eval(ids => {
    const sheet = game.actors.getName("Aria").sheet;
    return Object.fromEntries(ids.map(id => [id, [...sheet.element.querySelector(`.item[data-item-id="${id}"]`).classList]]));
  }, ids);
}

/**
 * Close Aria's sheet in a user's browser.
 * @param {import("./lib/session.mjs").Session} session
 */
function closeSheet(session) {
  return session.eval(() => game.actors.getName("Aria").sheet.close());
}

const spell = (name, level, prepared, method = "spell") => ({
  name, type: "spell", system: { level, method, prepared }
});

/* -------------------------------------------- */
/*  Settings Menus                              */
/* -------------------------------------------- */

test("settings menus: four buttons for the GM, each holding its own settings and none listed loose", async ({ gm }) => {
  const menus = await gm.eval(moduleId => {
    const menus = [...game.settings.menus.entries()].filter(([key]) => key.startsWith(`${moduleId}.`));
    const loose = [...game.settings.settings.values()].filter(s => (s.namespace === moduleId) && s.config);
    return {
      keys: menus.map(([key]) => key.slice(moduleId.length + 1)),
      restricted: menus.every(([, m]) => m.restricted),
      loose: loose.map(s => s.key)
    };
  }, MODULE_ID);
  assertEqual(menus.keys, Object.keys(MENUS), "settings menus");
  assert(menus.restricted, "A settings menu is open to players.");
  assertEqual(menus.loose, [], "settings listed outside the menus");

  for ( const [key, { id, settings }] of Object.entries(MENUS) ) {
    await gm.eval(({ moduleId, key }) => {
      const { type } = game.settings.menus.get(`${moduleId}.${key}`);
      return new type().render({ force: true });
    }, { moduleId: MODULE_ID, key });
    const app = gm.page.locator(`#${id}`);
    await app.waitFor({ timeout: 10_000 });
    const names = await app.locator('input[type="checkbox"], input[type="number"], select').evaluateAll(inputs => inputs.map(i => i.name));
    assertEqual(names, settings, `${key} settings`);
    await app.locator('[data-action="close"]').click();
    await app.waitFor({ state: "detached", timeout: 5000 });
  }
});

test("settings menus: ticking a box and saving changes that setting, and only that one", async ({ gm }) => {
  const before = await gm.eval(moduleId => Object.fromEntries(
    ["bloodiedTint", "fadeUnprepared", "rarityColours", "chatButtonLabels", "oneTabActivities"]
      .map(key => [key, game.settings.get(moduleId, key)])
  ), MODULE_ID);
  assert(Object.values(before).every(v => v === false), "A Gameplay Enhancement started on.");

  await gm.eval(moduleId => new (game.settings.menus.get(`${moduleId}.worldScripts`).type)().render({ force: true }),
    MODULE_ID);
  const app = gm.page.locator(`#${MENUS.worldScripts.id}`);
  await app.waitFor({ timeout: 10_000 });
  await app.locator('input[name="rarityColours"]').check();
  await app.locator('button[type="submit"]').click();
  await app.waitFor({ state: "detached", timeout: 5000 });

  const after = await gm.eval(moduleId => Object.fromEntries(
    ["bloodiedTint", "fadeUnprepared", "rarityColours", "chatButtonLabels", "oneTabActivities"]
      .map(key => [key, game.settings.get(moduleId, key)])
  ), MODULE_ID);
  assertEqual(after, { ...before, rarityColours: true }, "Gameplay Enhancements after saving");
});

test("welcome card: whispered to the GM once, its buttons opening the settings menus", async ({ gm, player }) => {
  const post = () => gm.eval(async moduleId => {
    const { postWelcomeIfDue } = await import(`/modules/${moduleId}/scripts/welcome.mjs`);
    await postWelcomeIfDue();
    return game.messages.filter(m => m.getFlag(moduleId, "welcome")).map(m => ({
      kind: m.getFlag(moduleId, "welcome"),
      gmOnly: m.whisper.every(id => game.users.get(id)?.isGM)
    }));
  }, MODULE_ID);
  await gm.eval(moduleId => game.settings.set(moduleId, "welcomeVersion", ""), MODULE_ID);
  assertEqual(await post(), [{ kind: "welcome", gmOnly: true }], "the welcome card");
  assertEqual(await post(), [{ kind: "welcome", gmOnly: true }], "the cards after posting again");
  // Foundry sends a whisper to everyone, but shows it only to those it's whispered to.
  assertEqual(await player.eval(moduleId => game.messages.filter(m => m.getFlag(moduleId, "welcome") && m.visible).length,
    MODULE_ID), 0, "welcome cards the player can see");

  const card = gm.page.locator("#chat .chat-log .stt-welcome");
  await card.waitFor({ timeout: 10_000 });
  // The Hero Cards feature is a content link the GM can drag onto a character.
  const link = card.locator("a.content-link[data-uuid]");
  assertEqual([await link.count(), await link.getAttribute("draggable")], [1, "true"], "the Hero Cards link");
  const linked = await gm.eval(async uuid => {
    const item = await fromUuid(uuid);
    return { name: item?.name, identifier: item?.system.identifier };
  }, await link.getAttribute("data-uuid"));
  assertEqual(linked, { name: "Hero Cards", identifier: "hero-cards" }, "the linked item");

  // The tankard in the line about asking for rolls opens the request window.
  await card.locator(".stt-welcome-tankard").click();
  const requests = gm.page.locator("#stt-roll-request");
  await requests.waitFor({ timeout: 10_000 });
  await gm.eval(() => foundry.applications.instances.get("stt-roll-request")?.close());
  await requests.waitFor({ state: "detached", timeout: 5000 });
  assertEqual(await card.locator("[data-stt-settings-menu]").evaluateAll(b => b.map(e => e.dataset.sttSettingsMenu)),
    ["heroCards", "diceRolling", "rollRequests", "worldScripts"], "the card's buttons");
  await card.locator('[data-stt-settings-menu="rollRequests"]').click();
  const app = gm.page.locator(`#${MENUS.rollRequests.id}`);
  await app.waitFor({ timeout: 10_000 });
  await app.locator('[data-action="close"]').click();
  await app.waitFor({ state: "detached", timeout: 5000 });
});

test("settings menus: the DC by default starts blank, saves a number, and clears again", async ({ gm }) => {
  const open = async () => {
    await gm.eval(moduleId => new (game.settings.menus.get(`${moduleId}.rollRequests`).type)().render({ force: true }),
      MODULE_ID);
    const app = gm.page.locator(`#${MENUS.rollRequests.id}`);
    await app.waitFor({ timeout: 10_000 });
    return app;
  };
  const save = async (app, value) => {
    await app.locator('input[name="defaultDC"]').fill(value);
    await app.locator('button[type="submit"]').click();
    await app.waitFor({ state: "detached", timeout: 5000 });
    return gm.eval(moduleId => game.settings.get(moduleId, "defaultDC"), MODULE_ID);
  };
  try {
    let app = await open();
    assertEqual(await app.locator('input[name="defaultDC"]').inputValue(), "", "the DC by default, to start with");
    assertEqual(await save(app, "14"), 14, "the setting after saving 14");
    app = await open();
    assertEqual(await app.locator('input[name="defaultDC"]').inputValue(), "14", "the DC by default once saved");
    assertEqual(await save(app, ""), null, "the setting after clearing it");
  } finally {
    await gm.eval(moduleId => game.settings.set(moduleId, "defaultDC", null), MODULE_ID);
  }
});

/* -------------------------------------------- */
/*  Gameplay Enhancements                       */
/* -------------------------------------------- */

test("world scripts: every one is off by default", async ({ gm }) => {
  const defaults = await gm.eval(moduleId => Object.fromEntries(
    ["bloodiedTint", "fadeUnprepared", "rarityColours", "chatButtonLabels", "oneTabActivities"]
      .map(key => [key, game.settings.settings.get(`${moduleId}.${key}`).default])
  ), MODULE_ID);
  assertEqual(defaults, {
    bloodiedTint: false, fadeUnprepared: false, rarityColours: false, chatButtonLabels: false, oneTabActivities: false
  }, "defaults");
});

test("bloodied tint: a creature that becomes Bloodied is tinted red, only with the setting on", async ({ gm, player }) => {
  const bloody = () => gm.eval(async () => {
    const goblin = game.actors.getName("Goblin");
    globalThis.__sttHP ??= {};
    globalThis.__sttHP[goblin.id] ??= foundry.utils.deepClone(goblin._source.system.attributes.hp);
    await goblin.update({ "system.attributes.hp.max": 10, "system.attributes.hp.value": 10 });
    await goblin.update({ "system.attributes.hp.value": 3 });
    await new Promise(r => setTimeout(r, 500));
    const effect = goblin.effects.get(CONFIG.ActiveEffect.documentClass.ID.BLOODIED);
    const changes = effect ? effect.toObject().system.changes ?? [] : null;
    return { bloodied: goblin.statuses.has("bloodied"), changes: changes?.map(c => `${c.key}=${c.value}`) ?? null };
  });

  const off = await bloody();
  assert(off.bloodied, "The Goblin isn't Bloodied at 3 of 10 hit points.");
  assert(!off.changes?.some(c => c.startsWith("token.texture.tint")), "The Goblin was tinted with the setting off.");

  // Healed, so the next drop makes a new Bloodied effect.
  await gm.eval(() => game.actors.getName("Goblin").update({ "system.attributes.hp.value": 10 }));
  await setSetting(gm, player, "bloodiedTint", true);
  const on = await bloody();
  assert(on.bloodied, "The Goblin isn't Bloodied at 3 of 10 hit points.");
  assert(on.changes.includes("token.texture.tint=#f19393"), `The Goblin's Bloodied effect has no red tint: ${on.changes}`);
  assert(on.changes.includes("token.ring.colors.background=#ff0000"),
    `The Goblin's Bloodied effect has no red ring background: ${on.changes}`);
});

test("fade unprepared spells: only a levelled spell that could be prepared but isn't is faded", async ({ gm, player }) => {
  const ids = await giveItems(gm, [
    spell("Unprepared Shield", 1, 0),
    spell("Prepared Sleep", 1, 1),
    spell("Always Bless", 1, 2),
    spell("Fire Bolt", 0, 0),
    spell("Innate Misty Step", 2, 0, "innate")
  ]);
  try {
    const faded = classes => ids.filter(id => classes[id].includes("preparation-unprepared"));
    assertEqual(faded(await rowClasses(player, ids)), [], "spells faded with the setting off");
    await closeSheet(player);

    await setSetting(gm, player, "fadeUnprepared", true);
    assertEqual(faded(await rowClasses(player, ids)), [ids[0]], "spells faded with the setting on");
  } finally {
    await closeSheet(player);
    await removeItems(gm, ids);
  }
});

test("item rarity colours: each item's row is tinted by its rarity, only with the setting on", async ({ gm, player }) => {
  const rarities = ["common", "uncommon", "rare", "veryRare", "legendary", "artifact"];
  const ids = await giveItems(gm, [
    ...rarities.map(rarity => ({ name: `Trinket (${rarity})`, type: "loot", system: { rarity } })),
    { name: "Plain Rock", type: "loot", system: { rarity: "" } }
  ]);
  try {
    const tints = classes => ids.map(id => classes[id].filter(c => c.startsWith("rarity-color-")).join(" ") || null);
    assertEqual(tints(await rowClasses(player, ids)), Array(ids.length).fill(null), "rows tinted with the setting off");
    await closeSheet(player);

    // An open sheet is drawn again when the setting changes.
    await rowClasses(player, ids);
    await setSetting(gm, player, "rarityColours", true);
    await waitFor(player, ids => ids.every(id => game.actors.getName("Aria").sheet.element
      ?.querySelector(`.item[data-item-id="${id}"]`)?.classList.contains(`rarity-color-${
        game.actors.getName("Aria").items.get(id).system.rarity.toLowerCase()}`)),
    ids.slice(0, -1), "the open sheet to redraw with each row's own rarity");
    assertEqual(tints(await rowClasses(player, ids, { render: false })), [
      "rarity-color-common", "rarity-color-uncommon", "rarity-color-rare", "rarity-color-veryrare",
      "rarity-color-legendary", "rarity-color-artifact", null
    ], "rows tinted with the setting on");
  } finally {
    await closeSheet(player);
    await removeItems(gm, ids);
  }
});

test("chat button labels: a compact card's icon buttons show their names, only with the setting on", async ({ gm, player }) => {
  // The Dagger's attack, used from chat, posts a compact card with Attack and Damage buttons.
  const id = await player.eval(async () => {
    const before = new Set(game.messages.keys());
    const attack = game.actors.getName("Aria").items.getName("Dagger").system.activities.find(a => a.type === "attack");
    await attack.use({ consume: false }, { configure: false }, { create: true });
    await new Promise(r => setTimeout(r, 500));
    return game.messages.contents.find(m => !before.has(m.id))?.id ?? null;
  });
  assert(id, "The Dagger's attack posted no chat card.");
  const labels = () => player.eval(id => [...document.querySelectorAll(
    `#chat [data-message-id="${id}"].compact .icon-row li > button.icon`
  )].map(b => ({ label: b.getAttribute("aria-label"), before: getComputedStyle(b, "::before").content })), id);

  await waitFor(player, id => !!document.querySelector(`#chat [data-message-id="${id}"].compact .icon-row button.icon`),
    id, "the card's icon buttons");
  const off = await labels();
  assert(off.length, "The card has no icon buttons.");
  assert(off.every(b => (b.before === "none") || (b.before === "normal")), `Labels are shown with the setting off: ${JSON.stringify(off)}`);
  assertEqual(await player.eval(() => document.body.classList.contains("stt-chat-button-labels")), false, "body class off");

  await setSetting(gm, player, "chatButtonLabels", true);
  await waitFor(player, () => document.body.classList.contains("stt-chat-button-labels"), null, "the labels to turn on");
  const on = await labels();
  for ( const button of on ) assertEqual(button.before, `"${button.label}"`, `the ${button.label} button's label`);
});

test("one-tab activities: an activity's three tabs are shown side by side, only with the setting on", async ({ gm, player }) => {
  const open = () => player.eval(async () => {
    const attack = game.actors.getName("Aria").items.getName("Dagger").system.activities.find(a => a.type === "attack");
    await attack.sheet.render({ force: true });
    await new Promise(r => setTimeout(r, 500));
    const el = attack.sheet.element;
    const shown = tab => {
      const t = el.querySelector(`.window-content > .tab[data-tab="${tab}"]`);
      return !!t && getComputedStyle(t).display !== "none";
    };
    const result = {
      tabs: ["identity", "activation", "effect"].filter(shown),
      nav: getComputedStyle(el.querySelector(".sheet-tabs")).display !== "none"
    };
    await attack.sheet.close();
    return result;
  });

  assertEqual(await open(), { tabs: ["identity"], nav: true }, "the activity with the setting off");
  await setSetting(gm, player, "oneTabActivities", true);
  await waitFor(player, () => document.body.classList.contains("stt-one-tab-activities"), null, "the layout to turn on");
  assertEqual(await open(), { tabs: ["identity", "activation", "effect"], nav: false }, "the activity with the setting on");
});
