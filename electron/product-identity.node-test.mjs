import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { configureProductIdentity } from "./product-identity.mjs";

test("each platform keeps its app, credentials, browser profile and instance lock outside MausBot", () => {
  for (const platform of ["win32", "darwin", "linux"]) {
    const paths = { appData: "/fixture/app-data", userData: "/fixture/app-data/OpenMausBot" };
    const calls = [];
    const app = { getPath: name => paths[name], setPath: (name, value) => { paths[name] = value; },
      setName: name => calls.push(name), setAppUserModelId: id => calls.push(id) };
    configureProductIdentity(app, platform);
    assert.equal(paths.userData, path.join(paths.appData, "SPDBot"));
    assert.equal(paths.sessionData, paths.userData);
    assert.deepEqual(calls, platform === "win32" ? ["SPDBot", "de.spdlabs.spdbot"] : ["SPDBot"]);
  }
});
