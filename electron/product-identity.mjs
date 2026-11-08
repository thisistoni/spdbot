import path from "node:path";
import { PURCHASE_AUTHORITY } from "./purchase-authority.mjs";

// Run before the instance lock, sessions, preferences and encrypted credential stores.
export function configureProductIdentity(app, platform = process.platform, argv = process.argv, authority = PURCHASE_AUTHORITY) {
  const preview = authority.environment === "preview";
  const name = preview ? "SPDBot Preview" : "SPDBot";
  app.setName(name);
  const option = argv.find(arg => arg.startsWith("--user-data-dir="))?.slice("--user-data-dir=".length)
    ?? (argv.includes("--user-data-dir") ? argv[argv.indexOf("--user-data-dir") + 1] : undefined);
  app.setPath("userData", option && path.isAbsolute(option) ? option : path.join(app.getPath("appData"), name));
  app.setPath("sessionData", app.getPath("userData"));
  if (platform === "win32") app.setAppUserModelId(preview ? "de.spdlabs.spdbot.preview" : "de.spdlabs.spdbot");
}
