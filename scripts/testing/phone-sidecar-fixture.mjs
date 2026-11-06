// Run the real compiled sidecar with loopback-only network discovery/binding.
import os from "node:os";
import net from "node:net";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import assert from "node:assert/strict";
os.networkInterfaces = () => ({});
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  if (args.includes("0.0.0.0")) this.once("listening", () => {
    assert.equal(this.address()?.address, "127.0.0.1");
    console.log("fixture: loopback companion bound");
  });
  return Reflect.apply(listen, this, args.map(value => value === "0.0.0.0" ? "127.0.0.1" : value));
};
const execFile = childProcess.execFile;
childProcess.execFile = function (file, ...args) {
  if (!/tailscale(?:\.exe)?$/i.test(file)) return execFile(file, ...args);
  const callback = args.at(-1);
  queueMicrotask(() => callback(Object.assign(new Error("offline phone fixture"), { code: "ENOENT" }), "", ""));
  return Object.assign(new EventEmitter(), { kill() {} });
};
syncBuiltinESMExports();
await import("../../dist-companion/index.js");
