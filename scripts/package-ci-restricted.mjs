import { build, Platform, Arch } from "electron-builder";
import { prepareRestrictedInputs, root } from "./ci-restricted-builder.mjs";

if (process.argv.length !== 2) throw new Error("Restricted packaging accepts no CLI overrides");
if (process.platform !== "linux" || process.arch !== "x64") throw new Error("Restricted package qualification requires Linux x64");
await prepareRestrictedInputs();
await build({
  projectDir: root, config: "scripts/ci-restricted-builder.mjs",
  targets: Platform.LINUX.createTarget(["AppImage", "deb"], Arch.x64), publish: "never",
});
