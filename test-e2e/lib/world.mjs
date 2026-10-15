/**
 * The test world: its manifest on disk, its module configuration, and the documents every run starts from.
 *
 * A world is a directory holding `world.json`. Foundry builds its database on first launch and, finding no
 * GM, creates a passwordless "Gamemaster", which is the account the harness joins as.
 */

import fs from "node:fs";
import path from "node:path";
import { CORE_VERSION, DATA_DIR, MODULE_ID, PLAYER_USER, SYSTEM, SYSTEM_VERSION, WORLD } from "../config.mjs";

/** Write the world's manifest if it is missing. */
export function ensureWorld() {
  const dir = path.join(DATA_DIR, "worlds", WORLD.id);
  const manifest = path.join(dir, "world.json");
  fs.mkdirSync(dir, { recursive: true });
  if ( fs.existsSync(manifest) ) return;
  fs.writeFileSync(manifest, `${JSON.stringify({
    id: WORLD.id,
    title: WORLD.title,
    description: WORLD.description,
    system: SYSTEM,
    systemVersion: SYSTEM_VERSION,
    coreVersion: CORE_VERSION,
    compatibility: { minimum: String(Math.trunc(Number(CORE_VERSION))), verified: CORE_VERSION },
    playtime: 0,
    flags: {}
  }, null, 2)}\n`, "utf8");
}

/* -------------------------------------------- */

/**
 * Turn on exactly the world's modules, reloading if that changed anything, and check they came up.
 * @param {import("./session.mjs").Session} gm
 */
export async function enableModules(gm) {
  const changed = await gm.eval(async wanted => {
    const want = new Set(wanted);
    const current = game.settings.get("core", "moduleConfiguration") ?? {};
    const next = Object.fromEntries([...game.modules.keys()].map(id => [id, want.has(id)]));
    const changed = Object.keys(next).some(id => (current[id] ?? false) !== next[id]);
    if ( changed ) await game.settings.set("core", "moduleConfiguration", next);
    return changed;
  }, WORLD.modules);
  if ( changed ) await gm.reload();
  const inactive = await gm.eval(wanted => wanted.filter(id => !game.modules.get(id)?.active), WORLD.modules);
  if ( inactive.length ) throw new Error(`Modules did not activate: ${inactive.join(", ")}\n${gm.tail()}`);
}

/* -------------------------------------------- */

/**
 * Clear out the last run and create the documents every test starts from:
 * - a Player user, who owns Aria and Borin;
 * - Aria, a character holding the Hero Cards from this module's compendium, and a Dagger from dnd5e's;
 * - Borin, a character with no cards;
 * - a Goblin NPC, owned by no player, with a linked token on the active scene.
 * @param {import("./session.mjs").Session} gm
 * @returns {Promise<{ player: string, aria: string, borin: string, goblin: string }>}  User ID and actor UUIDs.
 */
export async function resetFixtures(gm) {
  return gm.eval(async ({ moduleId, playerName }) => {
    await ChatMessage.deleteDocuments(game.messages.map(m => m.id));
    await Actor.deleteDocuments(game.actors.map(a => a.id));

    const player = game.users.getName(playerName)
      ?? await User.create({ name: playerName, role: CONST.USER_ROLES.PLAYER });

    const owned = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, [player.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
    const created = await Actor.createDocuments([
      { name: "Aria", type: "character", ownership: owned },
      { name: "Borin", type: "character", ownership: owned },
      { name: "Goblin", type: "npc" }
    ]);
    // Found by name: the created documents don't always come back in the order they were asked for.
    const [aria, borin, goblin] = ["Aria", "Borin", "Goblin"].map(name => created.find(a => a.name === name));

    const pack = game.packs.get(`${moduleId}.items`);
    const cards = (await pack.getDocuments()).find(i => i.system.identifier === "hero-cards" || i.name === "Hero Cards");
    if ( !cards ) throw new Error("The Hero Cards item is missing from the items compendium.");
    const dagger = (await game.packs.get("dnd5e.items").getDocuments({ name: "Dagger" }))[0];
    if ( !dagger ) throw new Error("dnd5e's Dagger is missing from its items compendium.");
    await aria.createEmbeddedDocuments("Item", [game.items.fromCompendium(cards), game.items.fromCompendium(dagger)]);

    await player.update({ character: aria.id });

    // The Goblin stands on the active scene, which is where the request window finds NPCs.
    await Scene.deleteDocuments(game.scenes.map(s => s.id));
    const scene = await Scene.create({ name: "Arena", active: true, width: 1000, height: 1000 });
    await scene.createEmbeddedDocuments("Token", [{ name: "Goblin", actorId: goblin.id, actorLink: true, x: 100, y: 100 }]);
    return { player: player.id, aria: aria.uuid, borin: borin.uuid, goblin: goblin.uuid };
  }, { moduleId: MODULE_ID, playerName: PLAYER_USER });
}

/* -------------------------------------------- */

/**
 * Put the world back to the fixtures' starting state: no chat, no combat, every card use restored, no
 * pending Advantage, no death saves or changed hit points, no forced dice, no stray windows or notifications.
 * @param {import("./session.mjs").Session} gm
 * @param {import("./session.mjs").Session} player
 */
export async function resetWorld(gm, player) {
  await gm.eval(async moduleId => {
    await ChatMessage.deleteDocuments(game.messages.map(m => m.id));
    await Combat.deleteDocuments(game.combats.map(c => c.id));
    if ( !game.settings.get(moduleId, "lockNaturals") ) await game.settings.set(moduleId, "lockNaturals", true);
    if ( !game.settings.get(moduleId, "markNaturals") ) await game.settings.set(moduleId, "markNaturals", true);
    if ( !game.settings.get(moduleId, "attachRolls") ) await game.settings.set(moduleId, "attachRolls", true);
    if ( !game.settings.get(moduleId, "showPlayedCards") ) await game.settings.set(moduleId, "showPlayedCards", true);
    for ( const key of ["popupPlayers", "popupGM", "deathSavePrompt", "bloodiedTint", "fadeUnprepared", "rarityColours",
      "chatButtonLabels", "oneTabActivities", "spellComponentWarnings", "flanking"] ) {
      if ( game.settings.get(moduleId, key) ) await game.settings.set(moduleId, key, false);
    }
    for ( const key of ["heavyWeapons", "loadingWeapons", "reloadWeapons", "lanceDisadvantage"] ) {
      if ( !game.settings.get(moduleId, key) ) await game.settings.set(moduleId, key, true);
    }
    for ( const actor of game.actors ) {
      if ( actor.getFlag(moduleId, "advantage") ) await actor.unsetFlag(moduleId, "advantage");
      // Hit points a test changed are put back as they were, kept by the test before it changed them.
      const changes = {};
      const hp = globalThis.__sttHP?.[actor.id];
      if ( hp ) changes["system.attributes.hp"] = hp;
      const death = actor.system.attributes?.death;
      if ( death?.success || death?.failure ) changes["system.attributes.death"] = { success: 0, failure: 0 };
      if ( actor.system.traits?.important && (actor.type === "npc") ) changes["system.traits.important"] = false;
      if ( Object.keys(changes).length ) await actor.update(changes);
      if ( actor.getFlag(moduleId, "stable") !== undefined ) await actor.unsetFlag(moduleId, "stable");
      for ( const item of actor.items ) {
        const updates = {};
        for ( const activity of item.system.activities ?? [] ) {
          if ( activity.uses?.spent ) updates[`system.activities.${activity.id}.uses.spent`] = 0;
        }
        if ( item.system.uses?.spent ) updates["system.uses.spent"] = 0;
        if ( Object.keys(updates).length ) await item.update(updates);
      }
    }
    globalThis.__sttHP = {};
  }, MODULE_ID);
  for ( const session of [gm, player] ) {
    await session.eval(async () => {
      if ( globalThis.__sttDice ) globalThis.__sttDice.length = 0;
      document.getElementById("stt-played-card")?.remove();
      if ( ui.menu?.rendered ) await ui.menu.close();
      ui.context?.close?.();
      for ( const app of foundry.applications.instances.values() ) {
        if ( app.rendered && (app.options.window?.frame !== false) && app.id !== "sidebar" && app.hasFrame ) await app.close();
      }
      ui.notifications.clear?.();
    });
  }
  await gm.page.waitForTimeout(300);
}
