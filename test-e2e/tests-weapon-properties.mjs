/**
 * End-to-end tests for the weapon properties D&D 5e marks but applies nothing for, and for the spellcasting focus
 * warning: Heavy and the 2014 Lance start attacks at disadvantage, Loading warns of a second shot in a combat turn,
 * Reload counts a weapon's shots on its Limited Uses, and a spell cast without a focus or component pouch is warned of.
 *
 * Weapons come from dnd5e's SRD items, given to Aria for a test and taken away after it. The SRD has no Reload weapon,
 * so one is made from the Dagger. Aria's abilities are all 10, too weak for a Heavy weapon under the 2024 rules.
 *
 * The Lance needs a target, which needs the canvas, so it is tested only when `STT_CANVAS=1` turns the canvas on.
 */

import { MODULE_ID } from "./config.mjs";
import { assert, assertEqual, test, waitFor } from "./lib/harness.mjs";

/**
 * Why a test of this module's Heavy rule is skipped with Midi-QOL, which applies the rule itself.
 */
const MIDI_HEAVY = { midi: "Midi-QOL applies the Heavy rule itself, so this module leaves Heavy to it." };

/**
 * Give Aria items from a compendium, each changed as given, as the GM.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {{ name: string, pack?: string, changes?: object }[]} items
 * @returns {Promise<string[]>}  The new items' IDs.
 */
function giveItems(gm, items) {
  return gm.eval(async items => {
    const data = [];
    for ( const { name, pack = "dnd5e.items", changes = {} } of items ) {
      const source = (await game.packs.get(pack).getDocuments({ name }))[0];
      if ( !source ) throw new Error(`${name} is missing from ${pack}.`);
      data.push(foundry.utils.mergeObject(game.items.fromCompendium(source), changes));
    }
    const created = await game.actors.getName("Aria").createEmbeddedDocuments("Item", data);
    return created.map(i => i.id);
  }, items);
}

/**
 * Take items back from Aria, as the GM.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {string[]} ids
 */
function takeItems(gm, ids) {
  return gm.eval(ids => {
    const actor = game.actors.getName("Aria");
    return actor.deleteEmbeddedDocuments("Item", ids.filter(id => actor.items.has(id)));
  }, ids);
}

/**
 * Change Aria, as the GM.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {object} changes
 */
function updateAria(gm, changes) {
  return gm.eval(changes => game.actors.getName("Aria").update(changes), changes);
}

/**
 * Roll an attack with one of Aria's weapons, skipping the roll dialog.
 * @param {import("./lib/session.mjs").Session} session
 * @param {string} name  The weapon's name.
 * @returns {Promise<number|null>}  The roll's advantage mode, or null when no attack was rolled.
 */
function attackWith(session, name) {
  return session.eval(async name => {
    // An item the GM has just given may not have reached this user yet.
    for ( let i = 0; (i < 50) && !game.actors.getName("Aria").items.getName(name); i++ ) {
      await new Promise(r => setTimeout(r, 100));
    }
    const activity = game.actors.getName("Aria").items.getName(name).system.activities.find(a => a.type === "attack");
    const rolls = await activity.rollAttack({}, { configure: false });
    return rolls?.length ? rolls[0].options.advantageMode : null;
  }, name);
}

/**
 * Start noting the warnings a user is shown, forgetting any noted before.
 * @param {import("./lib/session.mjs").Session} session
 */
function watchWarnings(session) {
  return session.eval(() => {
    globalThis.__sttWarnings = [];
    if ( ui.notifications.__sttWatched ) return;
    const warn = ui.notifications.warn.bind(ui.notifications);
    ui.notifications.warn = (message, options) => {
      globalThis.__sttWarnings?.push(options?.localize ? game.i18n.localize(message) : String(message));
      return warn(message, options);
    };
    ui.notifications.__sttWatched = true;
  });
}

/**
 * @param {import("./lib/session.mjs").Session} session
 * @param {string} text  What the warnings looked for say.
 * @returns {Promise<number>}  How many warnings noted since watchWarnings say it.
 */
function warningsSaying(session, text) {
  return session.eval(text => (globalThis.__sttWarnings ?? []).filter(w => w.includes(text)).length, text);
}

/**
 * @param {import("./lib/session.mjs").Session} session
 * @returns {Promise<{ disadvantage: number, normal: number }>}  dnd5e's advantage modes.
 */
function advantageModes(session) {
  return session.eval(() => ({
    disadvantage: CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE, normal: CONFIG.Dice.D20Roll.ADV_MODE.NORMAL
  }));
}

/**
 * Set one of the module's settings, as the GM.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {string} key
 * @param {*} value
 */
function setSetting(gm, key, value) {
  return gm.eval(({ moduleId, key, value }) => game.settings.set(moduleId, key, value), { moduleId: MODULE_ID, key, value });
}

/**
 * Wait for one of Aria's items to reach the uses expected, as the GM sees them.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {string} name
 * @param {{ max: number|null, spent: number }} expected
 * @param {string} what
 */
async function expectUses(gm, name, expected, what) {
  const read = () => gm.eval(name => {
    const { max, spent } = game.actors.getName("Aria").items.getName(name).system.uses;
    return { max: max || null, spent };
  }, name);
  await waitFor(gm, ({ name, expected }) => {
    const { max, spent } = game.actors.getName("Aria").items.getName(name).system.uses;
    return ((max || null) === expected.max) && (spent === expected.spent);
  }, { name, expected }, what).catch(() => {});
  assertEqual(await read(), expected, what);
}

/* -------------------------------------------- */
/*  Heavy                                       */
/* -------------------------------------------- */

test("weapon properties: each rule has its setting, on by default, and the focus warning off", async ({ gm }) => {
  const defaults = await gm.eval(moduleId => Object.fromEntries(
    ["heavyWeapons", "loadingWeapons", "reloadWeapons", "lanceDisadvantage", "spellFocusWarning"].map(key => {
      const s = game.settings.settings.get(`${moduleId}.${key}`);
      return [key, { config: s?.config, scope: s?.scope, default: s?.default }];
    })
  ), MODULE_ID);
  const on = { config: false, scope: "world", default: true };
  assertEqual(defaults, {
    heavyWeapons: on, loadingWeapons: on, reloadWeapons: on, lanceDisadvantage: on,
    spellFocusWarning: { ...on, default: false }
  }, "the settings");
});

test("heavy weapons: under the 2024 rules, an attack with too little Strength starts at disadvantage", async ({ gm, player }) => {
  const modes = await advantageModes(player);
  const ids = await giveItems(gm, [{ name: "Greatsword" }, { name: "Dagger", changes: { name: "Light Dagger" } }]);
  try {
    assertEqual(await attackWith(player, "Greatsword"), modes.disadvantage, "a Greatsword with Strength 10");
    assertEqual(await attackWith(player, "Light Dagger"), modes.normal, "a weapon that isn't Heavy");

    await updateAria(gm, { "system.abilities.str.value": 13 });
    await waitFor(player, () => game.actors.getName("Aria").system.abilities.str.value === 13, null, "Strength 13");
    assertEqual(await attackWith(player, "Greatsword"), modes.normal, "a Greatsword with Strength 13");

    await updateAria(gm, { "system.abilities.str.value": 10 });
    await setSetting(gm, "heavyWeapons", false);
    await waitFor(player, moduleId => !game.settings.get(moduleId, "heavyWeapons"), MODULE_ID, "the setting to turn off");
    assertEqual(await attackWith(player, "Greatsword"), modes.normal, "a Greatsword with the setting off");
  } finally {
    await updateAria(gm, { "system.abilities.str.value": 10 });
    await takeItems(gm, ids);
  }
}, { skip: MIDI_HEAVY });

test("heavy weapons: under the 2014 rules, only a Small or Tiny creature has disadvantage", async ({ gm, player }) => {
  const modes = await advantageModes(player);
  const ids = await giveItems(gm, [{ name: "Greatsword" }]);
  // D&D 5e asks for a reload to change its rules, and the module reads the rules it has loaded, so they are swapped
  // on the player's client alone.
  const rules = await player.eval(() => {
    const was = dnd5e.settings.rulesVersion;
    dnd5e.settings.rulesVersion = "legacy";
    return was;
  });
  try {
    assertEqual(await attackWith(player, "Greatsword"), modes.normal, "a Medium creature with Strength 10");
    await updateAria(gm, { "system.traits.size": "sm" });
    await waitFor(player, () => game.actors.getName("Aria").system.traits.size === "sm", null, "Aria to be Small");
    assertEqual(await attackWith(player, "Greatsword"), modes.disadvantage, "a Small creature");
  } finally {
    await player.eval(rules => dnd5e.settings.rulesVersion = rules, rules);
    await updateAria(gm, { "system.traits.size": "med" });
    await takeItems(gm, ids);
  }
}, { skip: MIDI_HEAVY });

/**
 * Give Aria an Active Effect changing her melee weapon attacks' roll mode, as the GM.
 * @param {import("./lib/session.mjs").Session} gm
 * @param {string} name
 * @param {string} type   The change's type, such as "add" or "upgrade".
 * @param {number} value
 * @returns {Promise<string>}  The effect's ID.
 */
function giveRollModeEffect(gm, name, type, value) {
  return gm.eval(async ({ name, type, value }) => {
    const [effect] = await game.actors.getName("Aria").createEmbeddedDocuments("ActiveEffect", [{
      name, type: "base", system: { changes: [{ key: "system.rolls.attack.mwak.mode", type, value, phase: "initial" }] }
    }]);
    return effect.id;
  }, { name, type, value });
}

test("heavy weapons: the disadvantage is resolved with Aria's own roll modes", async ({ gm, player }) => {
  const modes = await advantageModes(player);
  const ids = await giveItems(gm, [{ name: "Greatsword" }]);
  const effects = [];
  const removeEffects = () => gm.eval(ids => {
    const aria = game.actors.getName("Aria");
    return aria.deleteEmbeddedDocuments("ActiveEffect", ids.filter(id => aria.effects.has(id)));
  }, effects.splice(0));
  try {
    // Advantage on melee attacks cancels it out, as any two sources would.
    effects.push(await giveRollModeEffect(gm, "Advantage on Melee Attacks", "add", 1));
    await waitFor(player, () => game.actors.getName("Aria").effects.size > 0, null, "the effect");
    assertEqual(await attackWith(player, "Greatsword"), modes.normal, "a Greatsword with advantage on melee attacks");
    await removeEffects();

    // An effect saying the attack can't have disadvantage stops it.
    effects.push(await giveRollModeEffect(gm, "No Disadvantage on Melee Attacks", "upgrade", 0));
    await waitFor(player, () => game.actors.getName("Aria").effects.size > 0, null, "the effect");
    assertEqual(await attackWith(player, "Greatsword"), modes.normal, "a Greatsword that can't have disadvantage");
    await removeEffects();
    await waitFor(player, () => game.actors.getName("Aria").effects.size === 0, null, "the effects to go");
    assertEqual(await attackWith(player, "Greatsword"), modes.disadvantage, "a Greatsword with neither effect");
  } finally {
    await removeEffects();
    await takeItems(gm, ids);
  }
}, { skip: MIDI_HEAVY });

/* -------------------------------------------- */
/*  Loading                                     */
/* -------------------------------------------- */

test("loading weapons: a second shot in the same combat turn is warned of, and still rolled", async ({ gm, player }) => {
  const ids = await giveItems(gm, [{ name: "Light Crossbow" }]);
  const warning = "Light Crossbow has the Loading property";
  try {
    // Out of combat, nothing is counted.
    await watchWarnings(player);
    await attackWith(player, "Light Crossbow");
    await attackWith(player, "Light Crossbow");
    assertEqual(await warningsSaying(player, warning), 0, "warnings out of combat");

    await gm.eval(async () => {
      const combat = await Combat.create({ active: true });
      await combat.createEmbeddedDocuments("Combatant",
        ["Aria", "Goblin"].map(name => ({ actorId: game.actors.getName(name).id })));
      await combat.startCombat();
    });
    await waitFor(player, () => game.combat?.started, null, "the combat to reach the player");

    assert(await attackWith(player, "Light Crossbow") !== null, "The first shot of the turn wasn't rolled.");
    assertEqual(await warningsSaying(player, warning), 0, "warnings after the first shot of the turn");
    assert(await attackWith(player, "Light Crossbow") !== null, "The second shot of the turn wasn't rolled.");
    assertEqual(await warningsSaying(player, warning), 1, "warnings after the second shot of the turn");

    // The next turn starts afresh.
    await gm.eval(() => game.combat.nextTurn());
    await waitFor(player, () => game.combat.turn === 1, null, "the next turn");
    await attackWith(player, "Light Crossbow");
    assertEqual(await warningsSaying(player, warning), 1, "warnings after the first shot of the next turn");

    // Crossbow Expert ignores Loading on a crossbow.
    ids.push(...await gm.eval(async () => (await game.actors.getName("Aria").createEmbeddedDocuments("Item", [
      { name: "Crossbow Expert", type: "feat" }
    ])).map(i => i.id)));
    await waitFor(player, () => !!game.actors.getName("Aria").items.getName("Crossbow Expert"), null, "the feat");
    await attackWith(player, "Light Crossbow");
    assertEqual(await warningsSaying(player, warning), 1, "warnings with Crossbow Expert");
  } finally {
    await takeItems(gm, ids);
  }
});

test("loading weapons: with the setting off, a second shot isn't warned of", async ({ gm, player }) => {
  const ids = await giveItems(gm, [{ name: "Light Crossbow" }]);
  try {
    await setSetting(gm, "loadingWeapons", false);
    await gm.eval(async () => {
      const combat = await Combat.create({ active: true });
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: game.actors.getName("Aria").id }]);
      await combat.startCombat();
    });
    await waitFor(player, moduleId => game.combat?.started && !game.settings.get(moduleId, "loadingWeapons"),
      MODULE_ID, "the combat and the setting to reach the player");
    await watchWarnings(player);
    await attackWith(player, "Light Crossbow");
    await attackWith(player, "Light Crossbow");
    assertEqual(await warningsSaying(player, "Loading property"), 0, "warnings with the setting off");
  } finally {
    await takeItems(gm, ids);
  }
});

/* -------------------------------------------- */
/*  Reload                                      */
/* -------------------------------------------- */

/**
 * A Reload firearm made from the Dagger, which the SRD has none of.
 * @param {string} name
 * @param {object} [system]  More changes to its system data.
 * @returns {{ name: string, changes: object }}
 */
const firearm = (name, system = {}) => ({
  name: "Dagger",
  changes: { name, system: { properties: ["rel", "fir"], ...system } }
});

test("reload weapons: each attack spends a shot, and an empty weapon is reloaded instead of fired", async ({ gm, player }) => {
  const ids = await giveItems(gm, [firearm("Pistol", { uses: { max: "2", spent: 0 } })]);
  const dialog = player.page.locator(".application.dialog", { hasText: "Pistol is out of shots" });
  try {
    await attackWith(player, "Pistol");
    await attackWith(player, "Pistol");
    await expectUses(gm, "Pistol", { max: 2, spent: 2 }, "the Pistol after two shots");

    assertEqual(await attackWith(player, "Pistol"), null, "an attack with the Pistol empty");
    await dialog.waitFor({ timeout: 10_000 });
    await dialog.locator('button[data-action="yes"]').click();
    await expectUses(gm, "Pistol", { max: 2, spent: 0 }, "the Pistol once reloaded");

    assert(await attackWith(player, "Pistol") !== null, "The reloaded Pistol's attack wasn't rolled.");
    await expectUses(gm, "Pistol", { max: 2, spent: 1 }, "the Pistol after a shot once reloaded");
  } finally {
    await takeItems(gm, ids);
  }
});

test("reload weapons: an empty weapon left unreloaded stays empty, and fires with the setting off", async ({ gm, player }) => {
  const ids = await giveItems(gm, [firearm("Pistol", { uses: { max: "1", spent: 1 } })]);
  const dialog = player.page.locator(".application.dialog", { hasText: "Pistol is out of shots" });
  try {
    assertEqual(await attackWith(player, "Pistol"), null, "an attack with the Pistol empty");
    await dialog.waitFor({ timeout: 10_000 });
    await dialog.locator('button[data-action="no"]').click();
    await expectUses(gm, "Pistol", { max: 1, spent: 1 }, "the Pistol left empty");

    await setSetting(gm, "reloadWeapons", false);
    await waitFor(player, moduleId => !game.settings.get(moduleId, "reloadWeapons"), MODULE_ID, "the setting to turn off");
    assert(await attackWith(player, "Pistol") !== null, "The empty Pistol's attack wasn't rolled with the setting off.");
  } finally {
    await takeItems(gm, ids);
  }
});

test("reload weapons: a weapon with no Limited Uses is offered set-up from its description, once", async ({ gm, player }) => {
  const ids = await giveItems(gm, [
    firearm("Musket", { description: { value: "<p><em>Ammunition, Reload 4</em></p>" } }),
    firearm("Blunderbuss")
  ]);
  const setup = name => player.page.locator(".application.dialog", { hasText: `${name} has the Reload property` });
  try {
    assert(await attackWith(player, "Musket") !== null, "The Musket's first attack wasn't rolled.");
    await setup("Musket").waitFor({ timeout: 10_000 });
    assertEqual(await setup("Musket").locator('input[name="shots"]').inputValue(), "4", "the shots from its description");
    await setup("Musket").locator('button[data-action="ok"]').click();
    await expectUses(gm, "Musket", { max: 4, spent: 1 }, "the Musket, its first shot counted");

    // Cancelled, the set-up isn't offered again.
    await attackWith(player, "Blunderbuss");
    await setup("Blunderbuss").waitFor({ timeout: 10_000 });
    assertEqual(await setup("Blunderbuss").locator('input[name="shots"]').inputValue(), "", "no shots given");
    await setup("Blunderbuss").locator('button[data-action="close"], button[data-action="cancel"]').first().click();
    await setup("Blunderbuss").waitFor({ state: "detached", timeout: 5000 });
    await attackWith(player, "Blunderbuss");
    await player.page.waitForTimeout(800);
    assertEqual(await setup("Blunderbuss").count(), 0, "set-up offered again after it was cancelled");
    await expectUses(gm, "Blunderbuss", { max: null, spent: 0 }, "the Blunderbuss, left uncounted");
  } finally {
    await takeItems(gm, ids);
  }
});

/* -------------------------------------------- */
/*  Lance                                       */
/* -------------------------------------------- */

if ( process.env.STT_CANVAS ) {
  test("lance: the 2014 Lance attacks a target within 5 feet at disadvantage", async ({ gm, player }) => {
    const modes = await advantageModes(player);
    const ids = await giveItems(gm, [{ name: "Lance" }]);
    // The Goblin stands at (100, 100), so Aria starts in the space beside it.
    const token = await gm.eval(async () => {
      const [token] = await canvas.scene.createEmbeddedDocuments("Token", [
        { name: "Aria", actorId: game.actors.getName("Aria").id, actorLink: true, x: 200, y: 100 }
      ]);
      return token.id;
    });
    const target = () => player.eval(() => {
      const goblin = canvas.tokens.placeables.find(t => t.document.name === "Goblin");
      goblin.setTarget(true, { releaseOthers: true });
      return game.user.targets.size;
    });
    try {
      await waitFor(player, id => !!canvas.tokens.get(id), token, "Aria's token on the player's canvas");
      assertEqual(await target(), 1, "targets");
      assertEqual(await attackWith(player, "Lance"), modes.disadvantage, "the Lance against a target beside Aria");

      await gm.eval(id => canvas.scene.tokens.get(id).update({ x: 400 }, { animate: false }), token);
      await waitFor(player, id => canvas.tokens.get(id)?.document.x === 400, token, "Aria to move away");
      assertEqual(await attackWith(player, "Lance"), modes.normal, "the Lance against a target 10 feet away");

      await player.eval(() => canvas.tokens.setTargets([], { mode: "replace" }));
      await gm.eval(id => canvas.scene.tokens.get(id).update({ x: 200 }, { animate: false }), token);
      await waitFor(player, id => canvas.tokens.get(id)?.document.x === 200, token, "Aria to move back");
      assertEqual(await attackWith(player, "Lance"), modes.normal, "the Lance with no target");
    } finally {
      await player.eval(() => canvas.tokens.setTargets([], { mode: "replace" }));
      await gm.eval(id => canvas.scene.tokens.get(id)?.delete(), token);
      await takeItems(gm, ids);
    }
  });
}

/* -------------------------------------------- */
/*  Spellcasting Focus                          */
/* -------------------------------------------- */

/**
 * Cast one of Aria's spells, skipping its dialog and spending no slot.
 * @param {import("./lib/session.mjs").Session} session
 * @param {string} name
 */
async function cast(session, name) {
  await session.eval(name => {
    const activity = game.actors.getName("Aria").items.getName(name).system.activities.contents[0];
    globalThis.__sttCast = activity.use({ consume: false }, { configure: false }, { create: true })
      .then(() => globalThis.__sttCast = "done", () => globalThis.__sttCast = "done");
  }, name);
  // RSReforged opens the usage dialog even when asked not to, so it is used as a click on Use would.
  const usage = session.page.locator(".application.activity-usage button[data-action=use]");
  for ( let i = 0; i < 100; i++ ) {
    if ( await session.eval(() => globalThis.__sttCast === "done") ) break;
    // The dialog may draw itself again as it's clicked, so a click that misses is tried again next time round.
    if ( await usage.count() ) await usage.first().click({ timeout: 1000 }).catch(() => {});
    await session.page.waitForTimeout(100);
  }
  const stuck = await session.eval(() => (globalThis.__sttCast === "done" ? null
    : [...foundry.applications.instances.values()].filter(a => a.rendered && a.hasFrame && (a.id !== "sidebar"))
      .map(a => `${a.constructor.name}: ${a.title}`)));
  assert(!stuck, `Casting ${name} didn't finish. Open windows: ${stuck?.join(", ") || "none"}.`);
  await session.page.waitForTimeout(300);
}

test("spellcasting focus: a spell cast without a focus or pouch is warned of, only with the setting on", async ({ gm, player }) => {
  const ids = await giveItems(gm, [{ name: "Mage Armor", pack: "dnd5e.spells", changes: { system: { method: "spell", prepared: 1 } } }]);
  const warning = "needs Mage Armor's material components";
  try {
    await watchWarnings(player);
    await cast(player, "Mage Armor");
    assertEqual(await warningsSaying(player, warning), 0, "warnings with the setting off");

    await setSetting(gm, "spellFocusWarning", true);
    await waitFor(player, moduleId => game.settings.get(moduleId, "spellFocusWarning"), MODULE_ID, "the setting to turn on");
    await cast(player, "Mage Armor");
    assertEqual(await warningsSaying(player, warning), 1, "warnings with nothing to stand in for the materials");

    const [crystal] = await giveItems(gm, [{ name: "Crystal" }]);
    ids.push(crystal);
    await waitFor(player, () => !!game.actors.getName("Aria").items.getName("Crystal"), null, "the Crystal");
    await cast(player, "Mage Armor");
    assertEqual(await warningsSaying(player, warning), 2, "warnings with a focus carried but not equipped");

    await gm.eval(id => game.actors.getName("Aria").items.get(id).update({ "system.equipped": true }), crystal);
    await waitFor(player, id => game.actors.getName("Aria").items.get(id).system.equipped, crystal, "the Crystal equipped");
    await cast(player, "Mage Armor");
    assertEqual(await warningsSaying(player, warning), 2, "warnings with a focus equipped");

    await takeItems(gm, [crystal]);
    ids.push(...await giveItems(gm, [{ name: "Component Pouch" }]));
    await waitFor(player, () => !!game.actors.getName("Aria").items.getName("Component Pouch")
      && !game.actors.getName("Aria").items.getName("Crystal"), null, "the Component Pouch");
    await cast(player, "Mage Armor");
    assertEqual(await warningsSaying(player, warning), 2, "warnings with a component pouch carried");
  } finally {
    await takeItems(gm, ids);
  }
});
