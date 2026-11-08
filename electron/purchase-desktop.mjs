import path from "node:path";
import { PurchaseClient } from "./purchase-client.mjs";
import { createPurchaseStore } from "./purchase-store.mjs";
import { PURCHASE_AUTHORITY, purchaseProtocol } from "./purchase-authority.mjs";

export const isPurchaseLink = (raw, authority = PURCHASE_AUTHORITY) => { const prefix = `${purchaseProtocol(authority)}//auth`; return typeof raw === "string" && raw.toLowerCase().startsWith(prefix) && /^(?:[/:?#]|$)/.test(raw.slice(prefix.length)); };
export const takePurchaseLaunchLinks = (argv, authority = PURCHASE_AUTHORITY) => argv.filter(raw => isPurchaseLink(raw, authority)).slice(0, 4);

export function createPurchaseDesktop({ app, safeStorage, ipcMain, powerMonitor, shell, guard, fetch, authority = PURCHASE_AUTHORITY, launchLinks = [], window: mainWindow, createClient = options => new PurchaseClient(options), executionChanged = () => {} }) {
  const peers = new Map();
  let client = null;
  let early = launchLinks;
  let timer;
  let expiryTimer;
  let previousAllowed = null;
  const sync = async (proc, peer) => {
    if (!client || peer.busy) return;
    peer.busy = true;
    try {
      const bundle = await client.publicSecurity();
      if (!bundle) {
        proc.postMessage({ type: "spdbot:purchase-lock" });
        if (!client.record.security && peer.session) { peer.session = null; peer.nonce = null; proc.postMessage({ type: "spdbot:purchase-clear" }); }
        return;
      }
      if (peer.session && peer.session !== bundle.security.binding.sid) {
        peer.session = null; peer.nonce = null; proc.postMessage({ type: "spdbot:purchase-clear" }); return;
      }
      if (!peer.session && peer.nonce) {
        const possession = await client.possession(peer.nonce);
        if (!possession) return;
        proc.postMessage({ type: "spdbot:purchase-init", nonce: peer.nonce, ...possession });
        peer.session = bundle.security.binding.sid; peer.nonce = null;
      } else if (peer.session) proc.postMessage({ type: "spdbot:purchase-update", ...bundle });
    } finally { peer.busy = false; }
  };
  const changed = async state => {
    clearTimeout(expiryTimer);
    if (state.allowed && state.expiresAt) {
      expiryTimer = setTimeout(() => { void client.tick().catch(() => {}); }, Math.max(1, (state.expiresAt - client.clock.now()) * 1000));
      expiryTimer.unref();
    }
    if (previousAllowed !== state.allowed) {
      const notify = previousAllowed !== null; previousAllowed = state.allowed;
      // Main owns the initial CUA start; only later transitions restart or stop it.
      if (notify) executionChanged(state.allowed);
    }
    const win = mainWindow();
    if (win && !win.isDestroyed()) win.webContents.send("purchase:changed", state);
    await Promise.all([...peers].map(async ([proc, peer]) => { try { await sync(proc, peer); } catch { /* Exited child. */ } }));
  };
  for (const action of ["state", "connect", "refresh", "signOut"]) {
    const channel = `purchase:${action}`;
    ipcMain.handle(channel, guard(channel, async (_event, ...args) => {
      const owner = mainWindow()?.webContents;
      if (!owner || _event.sender !== owner || _event.senderFrame !== owner.mainFrame) throw new Error("invalid_purchase_sender");
      if (args.length || !client) throw new Error("invalid_purchase_action");
      try { return await client[action](); } catch { return client.state(); }
    }));
  }
  return {
    async start() {
      client = createClient({ store: createPurchaseStore(path.join(app.getPath("userData"), "purchase-access.bin"), {
        available: async () => (await safeStorage.isAsyncEncryptionAvailable()) && (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text"),
        encrypt: text => safeStorage.encryptStringAsync(text), decrypt: bytes => safeStorage.decryptStringAsync(bytes),
      }), fetch, authority, openExternal: url => shell.openExternal(url), version: app.getVersion(), platform: process.platform, changed });
      await client.start();
      // A cold callback has no persisted verifier and cannot silently bind an existing profile.
      for (const link of early) await client.receiveCallback(link);
      early = [];
      powerMonitor.on("resume", () => { void client.tick().catch(() => {}); });
      powerMonitor.on("suspend", () => { void client.tick().catch(() => {}); });
      timer = setInterval(() => { void client.tick().catch(() => {}); }, 10000); timer.unref();
      app.on("before-quit", () => { clearInterval(timer); clearTimeout(expiryTimer); });
    },
    fromUrl(raw) {
      if (!isPurchaseLink(raw, authority)) return false;
      if (client) void client.receiveCallback(raw).catch(() => {});
      else if (early.length < 4) early.push(raw);
      return true;
    },
    fromArgs(args) { const links = takePurchaseLaunchLinks(args, authority); links.forEach(link => this.fromUrl(link)); return links.length > 0; },
    async allowed() { return (await client?.state())?.allowed === true; },
    async cuaAllowed(isRemote) { return (await this.allowed()) && !isRemote() && ["darwin", "linux", "win32"].includes(process.platform); },
    async assert() { if (!(await this.allowed())) throw new Error("purchase_access_required"); },
    attach(proc) {
      const peer = { nonce: null, session: null, busy: false }; peers.set(proc, peer);
      proc.on("message", message => {
        if (message?.type !== "spdbot:purchase-challenge" || typeof message.nonce !== "string") return;
        peer.nonce = message.nonce; peer.session = null;
        void sync(proc, peer).catch(() => {});
      });
      proc.once("exit", () => peers.delete(proc));
    },
  };
}
