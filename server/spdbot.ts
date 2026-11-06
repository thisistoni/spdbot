import { main } from "./cli.ts";
import { exitAfterFlush } from "./exit.ts";
import { HEADLESS_VERB_NAMES } from "./cli-usage.ts";

const verb = process.argv[2] ?? "";
const finish = (code: number) => exitAfterFlush(code, { force: !HEADLESS_VERB_NAMES.has(verb) || ["events", "mcp"].includes(verb) });
main().then(finish, (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  finish(1);
});
