/**
 * Run the end-to-end tests against a real Foundry.
 *
 *   npm run test:e2e                  # every test
 *   npm run test:e2e -- divine        # only tests whose name contains "divine"
 *   HEADED=1 npm run test:e2e         # watch the browsers
 *
 * Starts the harness's own Foundry on the configured port with the test world, joins as the GM and as a
 * player in two browsers, and runs every tests-*.mjs file imported below.
 */

import { GM_USER, MODULE_ID, PLAYER_USER, WORLD } from "./config.mjs";
import { runTests } from "./lib/harness.mjs";
import { startFoundry } from "./lib/server.mjs";
import { Session } from "./lib/session.mjs";
import { enableModules, ensureWorld, resetFixtures, resetWorld } from "./lib/world.mjs";
import "./tests.mjs";
import "./tests-cards.mjs";
import "./tests-popup.mjs";
import "./tests-bonus.mjs";
import "./tests-features.mjs";
import "./tests-natural-saves.mjs";
import "./tests-natural-initiative.mjs";
import "./tests-natural-outcomes.mjs";
import "./tests-death-saves.mjs";
import "./tests-world-scripts.mjs";
import "./tests-weapon-properties.mjs";
import "./tests-compat.mjs";

const filter = process.argv.slice(2).find(a => !a.startsWith("--"));

ensureWorld();
console.log(`Starting Foundry with "${WORLD.title}"…`);
const server = await startFoundry(WORLD.id);
let gm;
let player;
let result;
try {
  gm = await Session.open(GM_USER);
  await enableModules(gm);
  const ids = await resetFixtures(gm);
  player = await Session.open(PLAYER_USER);
  for ( const session of [gm, player] ) {
    await session.eval(() => { ui.sidebar.expand(); ui.sidebar.changeTab("chat", "primary"); });
  }
  const versions = await gm.eval(moduleId => ({
    foundry: game.version, dnd5e: game.system.version, module: game.modules.get(moduleId).version
  }), MODULE_ID);
  console.log(`Foundry ${versions.foundry}, dnd5e ${versions.dnd5e}. Running tests:`);

  result = await runTests({ gm, player, ids }, { filter, beforeEach: () => resetWorld(gm, player) });
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

if ( result ) {
  console.log(`\n${result.passed} passed, ${result.failed.length} failed${result.skipped ? `, ${result.skipped} skipped` : ""}.`);
  for ( const { name, error } of result.failed ) console.log(`\n--- ${name} ---\n${error}`);
  if ( result.failed.length ) process.exitCode = 1;
}
