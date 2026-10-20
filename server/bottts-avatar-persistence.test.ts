import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import type { BotttsAvatarOptions } from "../shared/bottts-avatar.ts";
import { downgradeToV1, parsePackageDocument } from "../shared/package-format.ts";
import { parseBotProfilePatch } from "./bot-profile.ts";
import { DATA_DIR } from "./config.ts";
import { newBotDefaultsSchema, resolveBotCreationDefaults } from "./new-bot-defaults.ts";
import { createBotPackageExport, createTeamPackageExport } from "./package-export.ts";
import { importPackageDocument } from "./package-import.ts";
import { presetFromDefaults } from "./presets.ts";
import { RoutineManager } from "./routines.ts";
import { Store } from "./store.ts";
import { createTeamBackup, importTeamBackup } from "./team-backup.ts";
import { createTeamManifest, importedMemberProfile, parseTeamManifest } from "./team-manifest.ts";

const appearance: BotttsAvatarOptions = {
  eyes: "happy", mouth: "smile01", texture: true, textureVariant: "circuits", backgroundColor: "#448ef4", radius: 22,
};
const selection = () => ({ instanceId: "fixture", model: "fixture-model" });

function fixture() {
  const store = new Store(selection);
  const routines = new RoutineManager({
    botState: (id) => store.bot(id) ? "ready" : "missing",
    createTask: () => null,
    startTurn: async () => { throw new Error("Appearance tests must not run a bot"); },
  });
  const bot = store.createBot({ name: "Avatar", section: "Design", botttsAvatar: appearance }, { seedMessages: false });
  return { store, routines, bot };
}

describe("Bottts appearance persistence", () => {
  beforeEach(() => rmSync(DATA_DIR, { recursive: true, force: true }));

  it("accepts validated appearance and an explicit reset on both profile boundaries", () => {
    for (const strict of [false, true]) {
      expect(parseBotProfilePatch({ botttsAvatar: appearance }, strict)).toEqual({ ok: true, patch: { botttsAvatar: appearance } });
      expect(parseBotProfilePatch({ botttsAvatar: null }, strict)).toEqual({ ok: true, patch: { botttsAvatar: null } });
      expect(parseBotProfilePatch({ title: "Unrelated" }, strict)).toEqual({ ok: true, patch: { title: "Unrelated" } });
      for (const invalid of [
        { eyes: "unknown" }, { mouth: "unknown" }, { texture: "true" }, { textureVariant: "unknown" },
        { backgroundColor: "url(https://tracking.invalid/)" }, { radius: -1 }, { radius: 51 }, { radius: 0.5 },
        { seed: "change-bot-identity" },
      ]) expect(parseBotProfilePatch({ botttsAvatar: invalid } as never, strict).ok, JSON.stringify(invalid)).toBe(false);
    }
  });

  it("survives unrelated saves and reloads, and resets without deleting custom images or legacy fields", () => {
    const { store, bot } = fixture();
    const legacy = { avatarUrl: "/api/attachments/avatar.png", avatarCrop: "rounded" as const, avatarZoom: 1.5, mascotBody: "blob" as const };
    store.patchBotProfile(bot.id, legacy);
    store.patchBotProfile(bot.id, { title: "New title" });
    expect(new Store(selection).bot(bot.id)).toMatchObject({ ...legacy, botttsAvatar: appearance, title: "New title" });
    store.patchBotProfile(bot.id, { botttsAvatar: null });
    expect(new Store(selection).bot(bot.id)).toMatchObject({ ...legacy, botttsAvatar: null });
    const saved = JSON.parse(readFileSync(join(DATA_DIR, "bots.json"), "utf8"));
    expect(saved.find((row: { id: string }) => row.id === bot.id).botttsAvatar).toBeNull();
    const old = store.createBot({ name: "Unconfigured" }, { seedMessages: false });
    expect(new Store(selection).bot(old.id)).not.toHaveProperty("botttsAvatar");
  });

  it("preserves template appearance, explicit resets, and exported preset appearance", () => {
    const defaults = newBotDefaultsSchema.parse({ profile: { botttsAvatar: appearance } });
    expect(resolveBotCreationDefaults(defaults, {}).profile.botttsAvatar).toEqual(appearance);
    expect(resolveBotCreationDefaults(defaults, { settings: { botttsAvatar: null } }).profile.botttsAvatar).toBeNull();
    expect(presetFromDefaults(defaults, { includeNotes: false }).value?.preset.bot.appearance?.botttsAvatar).toEqual(appearance);
  });

  it("round-trips through team manifests and portable backups", () => {
    const { store, routines, bot } = fixture();
    const manifest = createTeamManifest({ name: "Design", memberIds: [bot.id] }, [bot]);
    const member = parseTeamManifest(manifest).team.members[0]!;
    expect(member.appearance.botttsAvatar).toEqual(appearance);
    expect(importedMemberProfile(member, new Set()).botttsAvatar).toEqual(appearance);
    const backup = createTeamBackup(store, [], "Design");
    expect(backup.bots.find((row) => row.key === bot.id)?.botttsAvatar).toEqual(appearance);
    const restored = importTeamBackup(store, routines, JSON.parse(JSON.stringify(backup)), selection());
    expect(restored.bots[0]?.botttsAvatar).toEqual(appearance);
    expect(new Store(selection).bot(restored.bots[0]!.id)?.botttsAvatar).toEqual(appearance);
  });

  it("round-trips through both package versions and a new imported bot", () => {
    const { store, routines, bot } = fixture();
    const input = { bots: [bot], groups: [], routines: [] };
    const legacy = createBotPackageExport({ name: "Design", ...input });
    expect(legacy.package.agents[0]?.appearance.botttsAvatar).toEqual(appearance);
    expect(parsePackageDocument(legacy).package.agents[0]?.appearance.botttsAvatar).toEqual(appearance);
    const exported = createTeamPackageExport({ team: "Design", published: null, ...input });
    const document = parsePackageDocument(JSON.parse(JSON.stringify(exported.document)));
    expect(document.package.agents[0]?.appearance.botttsAvatar).toEqual(appearance);
    const downgraded = downgradeToV1(document);
    expect("error" in downgraded).toBe(false);
    if (!("error" in downgraded)) expect(downgraded.document.package.agents[0]?.appearance.botttsAvatar).toEqual(appearance);
    const unexpected = () => { throw new Error("Avatar-only package must not invoke unrelated integrations"); };
    const restored = importPackageDocument(document, { trust: "file", mode: "add" }, {
      store, routines, defaultSelection: selection,
      skills: { install: unexpected, setEnabled: unexpected },
      memory: { writeIndex: unexpected, writeTopic: unexpected },
      mcp: { servers: () => ({}), refusal: () => undefined, persist: unexpected },
      sections: { writeBrief: unexpected }, images: { save: unexpected },
    });
    if (restored.alreadyAdded) throw new Error("unexpected duplicate import");
    expect(restored.bots[0]?.botttsAvatar).toEqual(appearance);
    expect(new Store(selection).bot(restored.bots[0]!.id)?.botttsAvatar).toEqual(appearance);
  });
});
