/**
 * Configuration for the end-to-end harness. Copy this to `config.mjs` and edit the paths.
 *
 * The harness drives a real Foundry install, so the paths are specific to one machine; `config.mjs`
 * is gitignored for that reason.
 */

import fs from "node:fs";

/** Where Foundry Virtual Tabletop's Node build is installed (the directory holding `main.mjs`). */
export const FOUNDRY_ROOT = "C:/foundryvtt";

/** Foundry's user data root (the directory holding `Data/`, `Config/` and `Logs/`). */
export const DATA_PATH = "C:/Users/<you>/AppData/Local/FoundryVTT";

/** Foundry's `Data/` directory. */
export const DATA_DIR = `${DATA_PATH}/Data`;

/** The harness runs its own Foundry on this port, so one already running on 30000 is left alone. */
export const PORT = 30099;

/**
 * Foundry serves HTTPS instead of HTTP once its `options.json` names a certificate, as it does after it sets up a
 * self-signed one. The harness accepts a self-signed certificate (see `lib/server.mjs` and `lib/session.mjs`).
 */
export const SSL = (() => {
  try {
    const options = JSON.parse(fs.readFileSync(`${DATA_PATH}/Config/options.json`, "utf8"));
    return !!(options.sslCert && options.sslKey);
  } catch {
    return false;
  }
})();

export const BASE_URL = `${SSL ? "https" : "http"}://127.0.0.1:${PORT}`;

/** The module under test. It must be linked into `Data/modules`: see `README.md`. */
export const MODULE_ID = "sogrom-table-tools";

/** The disposable test world. Its id is also its directory name under `Data/worlds`. */
/**
 * `STT_COMPAT=rsr`, `STT_COMPAT=midi` or `STT_COMPAT=crlngn` runs in a world of its own with that module enabled too,
 * to check compatibility.
 * The modules must be installed in `Data/modules`: see `README.md`.
 */
const COMPAT = {
  rsr: ["rsreforged"],
  midi: ["midi-qol", "dae", "socketlib", "lib-wrapper"],
  crlngn: ["crlngn-ui"]
}[process.env.STT_COMPAT] ?? null;

export const WORLD = COMPAT ? {
  id: `stt-compat-${process.env.STT_COMPAT}`,
  title: `Sogrom's Table Tools Compat (${process.env.STT_COMPAT})`,
  description: "<p>Compatibility tests for Sogrom's Table Tools. Its contents are created and deleted on every run.</p>",
  modules: [MODULE_ID, ...COMPAT]
} : {
  id: "stt-e2e",
  title: "Sogrom's Table Tools E2E",
  description: "<p>Automated tests for Sogrom's Table Tools. Its contents are created and deleted on every run.</p>",
  modules: [MODULE_ID]
};

export const SYSTEM = "dnd5e";
export const SYSTEM_VERSION = "6.0.5";
export const CORE_VERSION = "14.369";

/** Foundry creates this passwordless GM in a world that has none. */
export const GM_USER = "Gamemaster";

/** The player account the harness creates, to test what players see and can do. */
export const PLAYER_USER = "Player";

/** `HEADED=1` shows the browsers while they drive Foundry. */
export const HEADED = process.env.HEADED === "1";

export const SERVER_TIMEOUT_MS = 120_000;
export const WORLD_READY_TIMEOUT_MS = 90_000;
