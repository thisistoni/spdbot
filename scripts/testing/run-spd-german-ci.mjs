// Own the synthetic workspace until the browser assertions and screenshots finish.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const output = resolve(process.env.OMB_SPD_EVIDENCE || ".omb-scratch/spd-german-evidence");
await mkdir(output, { recursive: true });
let stdout = "";
let stderr = "";
const fixture = spawn(process.execPath, ["--experimental-strip-types", "scripts/verify-spd-theme.ts"], {
  cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"],
});
const stopped = new Promise((done) => fixture.once("close", done));
try {
  const info = await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error("SPD fixture did not become ready within 120 seconds")), 120_000);
    const failed = (error) => { clearTimeout(timer); fail(error); };
    fixture.once("error", failed);
    fixture.once("exit", (code) => failed(new Error(`SPD fixture exited before readiness: ${code}\n${stderr}`)));
    fixture.stderr.on("data", (chunk) => { stderr += String(chunk); process.stderr.write(chunk); });
    fixture.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      for (const line of stdout.split("\n")) {
        try {
          const candidate = JSON.parse(line);
          if (candidate.previewUrl && candidate.botId && candidate.settled?.status === "settled") {
            clearTimeout(timer);
            done(candidate);
            return;
          }
        } catch { /* Vite may log before the ready JSON. */ }
      }
    });
  });
  const code = await new Promise((done, fail) => {
    const browser = spawn(process.execPath, ["scripts/testing/check-spd-german.mjs", info.previewUrl, info.botId], {
      cwd: root, env: { ...process.env, OMB_SPD_EVIDENCE: output }, stdio: "inherit",
    });
    browser.once("error", fail);
    browser.once("close", done);
  });
  if (code !== 0) throw new Error(`SPD browser checks exited ${code}`);
} finally {
  fixture.kill("SIGINT");
  const timer = setTimeout(() => fixture.kill("SIGKILL"), 15_000);
  await stopped;
  clearTimeout(timer);
  await writeFile(resolve(output, "fixture.log"), stdout + "\n" + stderr);
}
