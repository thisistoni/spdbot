import { afterEach, expect, it, vi } from "vitest";
import { setLocale } from "./i18n";
import { BOT_ROLES, roleProfilePatch } from "./bot-roles";
import { BotCreationDraft, EMPTY_BOT_DEFAULTS } from "./bot-creation-draft";
import { createConfiguredBot } from "./create-configured-bot";
import { Speaker } from "./tts";

afterEach(() => { setLocale("en"); vi.unstubAllGlobals(); });

it("localizes role identity defaults without rewriting their prompts, names or application access", () => {
  setLocale("de");
  for (const role of BOT_ROLES) {
    const patch = roleProfilePatch(role);
    expect(patch.title).not.toBe(role.title);
    expect(patch.description).not.toBe(role.description);
    expect(patch.name).toBe(role.name);
    expect(patch.soul).toBe(role.soul);
    expect(Object.keys(patch).sort()).toEqual(["description", "name", "soul", "title"]);
  }
  setLocale("en");
  for (const role of BOT_ROLES) expect(roleProfilePatch(role)).toEqual({ name: role.name, title: role.title, description: role.description, soul: role.soul });
});

it("shows German draft and pre-creation feedback before any network request", async () => {
  setLocale("de");
  const request = vi.fn();
  const draft = new BotCreationDraft(EMPTY_BOT_DEFAULTS, vi.fn(), request);
  await expect(createConfiguredBot(draft, request)).rejects.toThrow("Gib dem Bot einen Namen");
  await expect(draft.request("/unsupported")).rejects.toThrow("Für diese Aktion muss der Bot zuerst erstellt werden");
  expect(request).not.toHaveBeenCalled();
});

it("localizes app-owned voice setup feedback but preserves upstream diagnostic messages", async () => {
  setLocale("de");
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ready: false }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  const speaker = new Speaker();
  await speaker.speak("Hallo");
  expect(speaker.state.error).toBe("Richte im Bot-Profil auf diesem Computer einen Sprachanbieter ein und wähle anschließend eine Stimme für den Bot.");
  fetcher.mockResolvedValue(new Response(JSON.stringify({ error: "provider diagnostic 429" }), { status: 429 }));
  await speaker.speak("Hallo");
  expect(speaker.state.error).toBe("provider diagnostic 429");
  fetcher.mockResolvedValue(new Response("{}", { status: 503 }));
  await speaker.speak("Hallo");
  expect(speaker.state.error).toBe("Der Sprachdienst hat den Status 503 zurückgegeben");
});
