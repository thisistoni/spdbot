// @vitest-environment happy-dom
import { createElement, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot } from "@/state/store";
import { setLocale } from "@/lib/i18n";
import { BOTTTS_EYES, BOTTTS_MOUTHS } from "../../shared/bottts-avatar";
import { BotttsAvatarEditor } from "./BotttsAvatarEditor";
import { RESET_DEFAULT_AVATAR_PATCH, type AvatarPatch } from "./avatar-editing";

const original = { id: "scout", name: "Scout", color: "green", avatarUrl: "/api/attachments/cat.webp", avatarCrop: "circle", avatarZoom: 2, avatarFocusX: 0.3, mascotBody: "star", mascotExpression: "proud" } as Bot;
let host: HTMLDivElement;
let root: Root;
let saved: Bot;
const patch = vi.fn();
function Fixture({ disabled = false }: { disabled?: boolean }) {
  const [bot, setBot] = useState(original);
  saved = bot;
  return createElement(BotttsAvatarEditor, { bot, disabled, onPatch: (next: AvatarPatch) => { patch(next); setBot((current) => ({ ...current, ...next })); } });
}
function button(selector: string) { return host.querySelector<HTMLButtonElement>(selector)!; }
function click(selector: string) { flushSync(() => button(selector).click()); }

beforeEach(() => { setLocale("en"); patch.mockClear(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); flushSync(() => root.render(createElement(Fixture))); });
afterEach(() => { flushSync(() => root.unmount()); host.remove(); });

describe("shared Bottts editor", () => {
  it("offers every supported face as a named, keyboard-accessible preview", () => {
    expect(host.querySelectorAll('[data-bottts-part="eyes"]').length).toBe(BOTTTS_EYES.length);
    expect(host.querySelectorAll('[data-bottts-part="mouth"]').length).toBe(BOTTTS_MOUTHS.length);
    for (const control of host.querySelectorAll('[data-bottts-part]')) expect(control.getAttribute("aria-label")).toBeTruthy();
  });
  it("merges repeated choices without dropping other overrides or a custom image", () => {
    click('[data-bottts-part="eyes"][data-bottts-value="hearts"]');
    click('[data-bottts-part="mouth"][data-bottts-value="smile02"]');
    click('[data-bottts-radius="50"]');
    expect(saved).toMatchObject({ ...original, avatarCrop: "mascot", botttsAvatar: { eyes: "hearts", mouth: "smile02", radius: 50 } });
    expect(button('[data-bottts-value="hearts"]').getAttribute("aria-pressed")).toBe("true");
  });
  it("returns one section to automatic without resetting the other settings", () => {
    click('[data-bottts-part="eyes"][data-bottts-value="hearts"]');
    click('[data-bottts-radius="50"]');
    flushSync(() => host.querySelector<HTMLButtonElement>("fieldset button")!.click());
    expect(saved.botttsAvatar).toEqual({ radius: 50 });
  });
  it("has eight explicit textures plus automatic and none", () => {
    const select = host.querySelector<HTMLSelectElement>("select")!;
    expect(select.options.length).toBe(10);
    flushSync(() => { select.value = "circuits"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(saved.botttsAvatar).toEqual({ texture: true, textureVariant: "circuits" });
    flushSync(() => { select.value = "none"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(saved.botttsAvatar).toEqual({ texture: false });
    flushSync(() => { select.value = "auto"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(saved.botttsAvatar).toEqual({});
  });
  it("disables controls while an avatar operation is pending", () => {
    flushSync(() => root.render(createElement(Fixture, { disabled: true })));
    for (const control of host.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>("button,input,select")) expect(control.disabled).toBe(true);
  });
  it("provides German control names and preserves custom settings on full reset", () => {
    setLocale("de"); flushSync(() => root.render(createElement(Fixture)));
    expect(host.textContent).toContain("Hintergrundfarbe");
    expect(button('[data-bottts-value="hearts"]').getAttribute("aria-label")).toBe("Herzaugen");
    expect({ ...original, botttsAvatar: { eyes: "hearts" }, ...RESET_DEFAULT_AVATAR_PATCH }).toEqual({ ...original, avatarCrop: "mascot", botttsAvatar: null });
  });
});
