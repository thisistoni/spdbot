// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "@/lib/i18n";
import type { Bot } from "@/state/store";

vi.mock("@/state/store", async original => ({
  ...await original<typeof import("@/state/store")>(),
  useStore: () => ({ state: { bots: [], instances: [] }, dispatch: vi.fn() }),
}));
vi.mock("./DesktopCapabilities", () => ({
  useCaptionChrome: () => ({ dragProps: {}, padClass: "" }),
  useDesktopCapabilities: () => ({ capabilities: { host: { platform: "darwin" }, localComputer: { available: false } } }),
}));
vi.mock("./RunLog", () => ({ RunLog: () => null }));
import { ChatMarkdown } from "./ChatMarkdown";
import { AttachmentThumbnail } from "./AttachmentPreview";
import { MacLocalControl } from "./MacLocalControl";
import { LocalVmWorkspace } from "./LocalVmWorkspace";
import { InspectorPanel } from "./InspectorPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
beforeEach(() => { setLocale("de"); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); setLocale("en"); });

describe("German message previews and local computer views", () => {
  it("localizes code actions and line counts without touching code", () => {
    const html = renderToStaticMarkup(createElement(ChatMarkdown, { text: "```txt\nOriginal code\n```" }));
    expect(html).toContain("Original code");
    expect(html).toContain("1 Zeile");
    expect(html).toContain("Code kopieren");
    expect(html).toContain("Speichern");
    expect(html).not.toContain("Copy code");
  });

  it("updates memoized markdown controls when the locale changes", async () => {
    const text = "```txt\nOriginal code\n```";
    setLocale("en");
    await act(async () => root.render(createElement(ChatMarkdown, { text })));
    expect(host.querySelector('[title="Copy code"]')).not.toBeNull();
    setLocale("de");
    await act(async () => root.render(createElement(ChatMarkdown, { text })));
    expect(host.querySelector('[title="Code kopieren"]')).not.toBeNull();
    expect(host.textContent).toContain("Original code");
  });

  it("localizes attachment loading and keeps the filename", () => {
    const html = renderToStaticMarkup(createElement(AttachmentThumbnail, { image: { src: "/image.png", name: "Original image.png" }, onPreview: () => {} }));
    expect(html).toContain("Original image.png wird geladen");
  });

  it("localizes system-permission controls without claiming permission was granted", () => {
    const html = renderToStaticMarkup(createElement(MacLocalControl));
    expect(html).toContain("Steuerung dieses Computers erlauben");
    expect(html).toContain("Systemeinstellungen öffnen");
    expect(html).toContain("Erneut versuchen");
  });

  it("retains the VM view-only boundary in German", () => {
    const html = renderToStaticMarkup(createElement(LocalVmWorkspace, { primaryBotId: "bot", overlayOpen: false, onClose: () => {}, onOpenComputer: () => {} }));
    expect(html).toContain("Zwei Live-Desktops · eine aktive Steuerung · standardmäßig nur Ansicht");
    expect(html).toContain("Lokale VM für Bereich 1");
    expect(html).toContain("Ansicht der lokalen VM schließen");
  });

  it("localizes inspector navigation rather than its raw event data", () => {
    const html = renderToStaticMarkup(createElement(InspectorPanel, { bot: { id: "bot", threadId: "thread", messages: [], tasks: [] } as unknown as Bot }));
    expect(html).toContain("Inspektor schließen");
    expect(html).toContain("Ereignisse");
    expect(html).toContain("Rohdaten");
  });
});
