import path from "node:path";

// Run before the instance lock, sessions, preferences and encrypted credential stores.
export function configureProductIdentity(app, platform = process.platform, argv = process.argv) {
  app.setName("SPDBot");
  const option = argv.find(arg => arg.startsWith("--user-data-dir="))?.slice("--user-data-dir=".length)
    ?? (argv.includes("--user-data-dir") ? argv[argv.indexOf("--user-data-dir") + 1] : undefined);
  app.setPath("userData", option && path.isAbsolute(option) ? option : path.join(app.getPath("appData"), "SPDBot"));
  app.setPath("sessionData", app.getPath("userData"));
  if (platform === "win32") app.setAppUserModelId("de.spdlabs.spdbot");
}
