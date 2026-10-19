// An action, not a router: it never carries an address, code or credential.
export const CLOUD_DEEP_LINK = "openmausbot://cloud";

export const isCloudDeepLink = value => value === CLOUD_DEEP_LINK;
export function takeCloudDeepLink(argv) {
  let found = false;
  // Relaunch reuses process.argv: consume only this one-shot action, leaving flags and other links untouched.
  for (let index = argv.length - 1; index >= 0; index--) {
    if (!isCloudDeepLink(argv[index])) continue;
    argv.splice(index, 1);
    found = true;
  }
  return found;
}

// This fork has no owned Cloud checkout; retain existing account access without advertising upstream plans.
const OWNED_CLOUD_OFFERS_AVAILABLE = false;

export function createCloudOfferPolicy({ isPackaged, isRemote, serverReady, serverPort, refreshMenu, fetch: fetchImpl = fetch }) {
  let brandedBuild = null;
  async function readCloudOfferBrand() {
    if (brandedBuild !== null || !isPackaged() || isRemote()) return;
    const status = await fetchImpl(`http://127.0.0.1:${serverPort()}/api/brand`, { signal: AbortSignal.timeout(3_000) })
      .then(res => (res.ok ? res.json() : null)).catch(() => null);
    if (!status || brandedBuild !== null) return;
    brandedBuild = status.source === "file";
    refreshMenu();
  }
  function cloudOffersAllowed() {
    return OWNED_CLOUD_OFFERS_AVAILABLE && isPackaged() && !isRemote() && brandedBuild === false;
  }
  async function cloudOffersReady() {
    if (!OWNED_CLOUD_OFFERS_AVAILABLE) return false;
    if (brandedBuild === null && serverReady()) await readCloudOfferBrand();
    return cloudOffersAllowed();
  }
  return { readCloudOfferBrand, cloudOffersAllowed, cloudOffersReady };
}

export function createCloudEntry({ reveal, open }) {
  let pending = false, ready = false;
  async function deliver() {
    if (!ready || !pending) return false;
    pending = false;
    try { return await open(); } catch { return false; }
  }
  function request() {
    pending = true;
    reveal();
    void deliver();
    return true;
  }
  return {
    fromLaunch(argv) {
      if (takeCloudDeepLink(argv)) pending = true;
      return pending;
    },
    fromArgs: argv => takeCloudDeepLink(argv) && request(),
    /** False leaves the URL to the other link handlers. */
    fromUrl: url => isCloudDeepLink(url) && request(),
    ready() {
      ready = true;
      return deliver();
    },
  };
}
