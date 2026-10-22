// Browser daemons and saved sessions belong to this product and this workspace.
// A PID file alone never proves ownership, even when both apps run as the same OS user.
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./config.ts";

export const BROWSER_NAMESPACE = `spd-${createHash("sha256").update(DATA_DIR).digest("hex").slice(0, 20)}`;

/** Keep the namespace plus a normal 40-character session below Unix's 103-byte socket limit. */
export function browserSocketRoot(): string {
  if (process.platform === "win32") return join(DATA_DIR, "browser-run");
  const uid = process.getuid!();
  const root = `/tmp/spd-${uid.toString(36)}`;
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== uid || (stat.mode & 0o077) !== 0) {
    throw new Error("SPDBot browser runtime directory is not private or belongs to another user.");
  }
  return root;
}
