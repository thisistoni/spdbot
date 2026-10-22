// Browser daemons and saved sessions belong to this product and this workspace.
// A PID file alone never proves ownership, even when both apps run as the same OS user.
import { createHash } from "node:crypto";
import { DATA_DIR } from "./config.ts";

export const BROWSER_NAMESPACE = `spdbot-${createHash("sha256").update(DATA_DIR).digest("hex").slice(0, 20)}`;
