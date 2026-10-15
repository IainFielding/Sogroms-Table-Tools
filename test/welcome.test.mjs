import { beforeEach, describe, expect, it } from "vitest";
import { settingValues } from "./helpers/foundry-shims.mjs";
import { CARDS_ITEM_ID, MODULE_ID } from "../scripts/hero-cards.mjs";
import { WHATS_NEW, cardDue, newerThan, postWelcomeIfDue } from "../scripts/welcome.mjs";

/**
 * The GM's welcome card: once on a world's first run, a what's new note after a release that adds features, nothing
 * for a patch, and nothing at all with the setting off.
 */

const entries = [
  { version: "0.1.1", lines: ["a"] },
  { version: "0.2.0", lines: ["b"] }
];

describe("newerThan", () => {
  it("compares part by part as numbers", () => {
    expect(newerThan("0.10.0", "0.9.0")).toBe(true);
    expect(newerThan("0.1.1", "0.1.1")).toBe(false);
    expect(newerThan("0.1", "0.1.0")).toBe(false);
    expect(newerThan("0.1.1", "0.1")).toBe(true);
    expect(newerThan("0.0.9", "0.1.0")).toBe(false);
  });
});

describe("cardDue", () => {
  it("welcomes a world that has never had a card, at the latest feature release", () => {
    expect(cardDue("", entries)).toEqual({ kind: "welcome", version: "0.2.0" });
  });

  it("lists every feature release since the last one announced", () => {
    expect(cardDue("0.1.1", entries)).toMatchObject({ kind: "whatsNew", version: "0.2.0" });
    expect(cardDue("0.1.0", entries).entries.map(e => e.version)).toEqual(["0.1.1", "0.2.0"]);
  });

  it("says nothing once the latest has been announced, as after a patch release", () => {
    expect(cardDue("0.2.0", entries)).toBeNull();
  });

  it("has a feature release to announce, each line in the language file", () => {
    expect(WHATS_NEW.length).toBeGreaterThan(0);
    for ( const e of WHATS_NEW ) {
      expect(e.lines.length).toBeGreaterThan(0);
      for ( const key of e.lines ) expect(game.i18n.localize(key)).not.toBe(key);
    }
  });
});

describe("postWelcomeIfDue", () => {
  let created;
  let rendered;

  beforeEach(() => {
    created = [];
    rendered = [];
    settingValues.set("welcomeCards", true);
    settingValues.set("welcomeVersion", "");
    game.user = { isActiveGM: true, isGM: true };
    game.settings.set = async (_scope, key, value) => settingValues.set(key, value);
    foundry.applications.handlebars = { renderTemplate: async (_path, data) => {
      rendered.push(data);
      return "<div></div>";
    } };
    foundry.applications.ux.TextEditor = { implementation: { enrichHTML: async html => `${html}<!-- enriched -->` } };
    globalThis.ChatMessage = {
      getWhisperRecipients: () => [{ id: "gm-user" }],
      create: async data => created.push(data)
    };
  });

  it("whispers the welcome to the GMs once, saving what it announced", async () => {
    await postWelcomeIfDue();
    expect(created).toHaveLength(1);
    expect(created[0].whisper).toEqual(["gm-user"]);
    expect(created[0].flags[MODULE_ID].welcome).toBe("welcome");
    expect(rendered[0].places.length).toBeGreaterThan(0);
    // The Hero Cards feature is linked, so the GM can drag it from the card onto a character.
    expect(rendered[0].places[0]).toContain(`@UUID[Compendium.${MODULE_ID}.items.Item.${CARDS_ITEM_ID}]{Hero Cards}`);
    expect(created[0].content).toContain("<!-- enriched -->");
    // The request button stands in the line about asking for rolls, and the rest of the text is escaped.
    expect(rendered[0].places[2]).toContain('<button type="button" class="stt-welcome-tankard" data-stt-open-requests');
    expect(rendered[0].places[2]).not.toContain("{tankard}");
    expect(rendered[0].buttons.map(b => b.menu)).toEqual(["heroCards", "diceRolling", "rollRequests", "worldScripts"]);
    expect(settingValues.get("welcomeVersion")).toBe(WHATS_NEW.at(-1).version);

    await postWelcomeIfDue();
    expect(created).toHaveLength(1);
  });

  it("posts what's new, without the welcome's places, to a world that had an earlier card", async () => {
    settingValues.set("welcomeVersion", "0.0.1");
    await postWelcomeIfDue();
    expect(created[0].flags[MODULE_ID].welcome).toBe("whatsNew");
    expect(rendered[0].places).toEqual([]);
    expect(rendered[0].lines.length).toBeGreaterThan(0);
  });

  it("posts nothing with the setting off, nor from a client that isn't the active GM", async () => {
    settingValues.set("welcomeCards", false);
    await postWelcomeIfDue();
    settingValues.set("welcomeCards", true);
    game.user = { isActiveGM: false, isGM: true };
    await postWelcomeIfDue();
    expect(created).toHaveLength(0);
    expect(settingValues.get("welcomeVersion")).toBe("");
  });
});
