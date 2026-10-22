// Electron has no role for the macOS Preferences… item, so it is built explicitly.
import { Menu, app } from "electron";

/**
 * @param {object} input
 * @param {{ id: string, name: string, origin: string }[]} input.environments
 * @param {string} input.activeId  "local" or an environment id
 * @param {(id: string) => void} input.onSwitch
 * @param {() => void} input.onAddFromClipboard
 * @param {() => void} input.onConnect
 * @param {(id: string) => void} input.onForget
 * @param {() => void} input.onOpenSettings
 */
export function buildApplicationMenu({ environments, activeId, onSwitch, onAddFromClipboard, onConnect, onForget, onOpenSettings, sublabels = {} }) {
  const isMac = process.platform === "darwin";
  const active = environments.find((e) => e.id === activeId) ?? null;
  const server = {
    label: "Server",
    submenu: [
      { label: "Dieser Computer", type: "radio", checked: !active, click: () => onSwitch("local") },
      ...environments.map((e) => ({
        label: `${e.name} — ${Object.hasOwn(sublabels, e.id) ? sublabels[e.id] : new URL(e.origin).host}`,
        type: "radio",
        checked: e.id === activeId,
        click: () => onSwitch(e.id),
      })),
      { type: "separator" },
      { label: "Mit einem Server verbinden…", click: onConnect },
      { label: "Server aus kopiertem Kopplungslink hinzufügen…", click: () => onAddFromClipboard() },
      {
        label: active ? `„${active.name}“ entfernen` : "Server entfernen",
        enabled: Boolean(active),
        click: () => active && onForget(active.id),
      },
    ],
  };
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [{ role: "about" }, { label: "Einstellungen…", accelerator: "CmdOrCtrl+,", click: () => onOpenSettings() }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] }] : []),
    { role: "fileMenu", label: "Datei" },
    { role: "editMenu", label: "Bearbeiten" },
    server,
    { role: "viewMenu", label: "Ansicht" },
    { role: "windowMenu", label: "Fenster" },
  ];
  return Menu.buildFromTemplate(template);
}
