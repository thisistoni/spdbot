import { HEADLESS_USAGE } from "../cli-usage.ts";
import { EXIT, HeadlessError, MUTATING_VERBS, parseCommand } from "./args.ts";
import { explain, loadMcp, openClient, type ClientDeps, type HeadlessClient } from "./client.ts";
import { doctor, edit, interrupt, list, messages, newBot, newChannel, send, setModel } from "./commands.ts";
import { connectVerb } from "./connect.ts";
import type { VerbContext, VerbOutcome } from "./context.ts";
import { engineVerb } from "./engine.ts";
import { eventsVerb } from "./events.ts";
import { exportVerb } from "./export.ts";
import { Output, processIo, type HeadlessIo } from "./output.ts";
import { runVerb, waitVerb } from "./run.ts";
import { teamApplyVerb, teamExportVerb } from "./team-apply.ts";

const T = "TARGET bezeichnet einen Bot oder eine Gruppe per Name oder ID. Alternativ: --bot ID, --channel ID oder --thread ID. --task ID wählt einen bestimmten Chat.";

/** Help is human-facing; verbs, flags and machine-readable results keep their existing grammar. */
export const VERB_HELP: Record<string, string> = {
  doctor: `pnpm spdbot doctor [--wait DURATION]
  Prüft, ob der Server antwortet, aktuell genug ist, dich erkennt und eine Engine bereitsteht.
  --wait 2m prüft bis zu zwei Minuten. Exitcode: 0 bereit, 1 keine Engine, 5 nicht erreichbar oder zu alt.`,
  bots: "pnpm spdbot bots\n  Deine Bots und ihre aktuelle Arbeit anzeigen.",
  channels: "pnpm spdbot channels\n  Deine Gruppen und ihre Mitglieder anzeigen.",
  models: "pnpm spdbot models\n  Engines und ihre Modelle anzeigen. Verwende sie als INSTANCE/MODEL.",
  messages: `pnpm spdbot messages TARGET [--limit 30]\n  Die letzten Nachrichten eines Chats anzeigen, höchstens 200.
  ${T}`,
  send: `pnpm spdbot send TARGET (TEXT | --text TEXT | --message-file FILE | -) [--send-id ID] [--dry-run]
  Eine Nachricht senden und sofort zurückkehren. Dieselbe --send-id sendet nie zweimal.
  ${T}`,
  "send-channel": "pnpm spdbot send-channel --channel ID (TEXT | --text TEXT) [--task ID] [--dry-run]\n  Wie send, für eine Gruppe mit der angegebenen ID.",
  run: `pnpm spdbot run TARGET (TEXT | --message-file FILE | -) [--task new|current|ID] [--title T]
                [--wait job|turn|none] [--timeout 30m] [--on-input exit|wait|stop] [--on-timeout leave|stop]
                [--strict] [--export DIR [--force]]
  Einem Bot oder einer Gruppe einen Auftrag geben und auf alle beteiligten Bots warten.
  Beginnt einen neuen Chat, sofern --task nichts anderes festlegt. Fortschritt erscheint auf stderr,
  danach die letzte Antwort mit verknüpften Dateien. --export exportiert den abgeschlossenen Auftrag
  nach DIR: ein neuer oder leerer Ordner, der vor dem Senden geprüft wird. --force erlaubt einen belegten Ordner.
  --on-input: exit beendet mit 3, wenn eine Antwort nötig ist; wait wartet darauf; stop stoppt den Auftrag.
  --on-timeout: leave lässt die Arbeit weiterlaufen; stop stoppt sie.
  --strict: Ein Fehler eines beteiligten Bots lässt den gesamten Durchlauf fehlschlagen.
  Exitcodes: 0 fertig, 1 fehlgeschlagen oder gestoppt, 3 Eingabe nötig, 4 Zeitlimit, 130 Strg+C (Arbeit läuft weiter).
  ${T}`,
  wait: `pnpm spdbot wait TARGET [--for job|turn] [--timeout 30m] [--on-input …] [--on-timeout …] [--strict] [--since MS]
  Auf einen bereits laufenden Chat warten, etwa nach run --wait none, Strg+C oder einem CI-Neustart.
  --since MS (von run ausgegeben) verfolgt denselben Auftrag und meldet auch dessen zwischenzeitlichen Abschluss.
  Wenn nichts läuft, endet der Befehl sofort mit 0. Sonst gelten dieselben Exitcodes wie bei run.
  ${T}`,
  interrupt: `pnpm spdbot interrupt TARGET [--tree] [--dry-run]\n  Einen Chat stoppen. --tree stoppt auch alle Bots, die noch an dessen Auftrag arbeiten.
  ${T}`,
  "new-bot": "pnpm spdbot new-bot NAME [--title T] [--team T] [--model INSTANCE/MODEL] [--effort E]\n  Einen Bot erstellen.",
  "new-channel": "pnpm spdbot new-channel NAME --members A,B [--team T]\n  Eine Gruppe aus Bots erstellen, angegeben per Name oder ID.",
  "set-model": "pnpm spdbot set-model BOT --model INSTANCE/MODEL [--effort E] [--task ID] [--dry-run]\n  Das Modell eines untätigen Bots ändern. Mit --task nur das Modell eines untätigen Chats ändern.",
  edit: "pnpm spdbot edit BOT --message ID (TEXT | --text TEXT) [--task ID] [--dry-run]\n  Eine frühere eigene Nachricht bearbeiten und den Bot ab dort erneut antworten lassen.",
  export: `pnpm spdbot export TARGET --out DIR [--root ID] [--since MS] [--max-files 200] [--max-screens 100] [--max-bytes 500MB] [--force]
  Einen Auftrag nach DIR exportieren: Auftragsstruktur, Chatverläufe mit entfernten Geheimnissen,
  verknüpfte Dateien und Bildschirmbilder. --root beschränkt den Export auf einen Auftrag.
  ${T}`,
  events: `pnpm spdbot events [--thread ID]… [--job THREAD_ID [--until-settled]] [--kind K,…] [--since CURSOR] [--screens] [--jsonl]
  Live-Ereignisse des Servers ausgeben, je eine JSON-Zeile: Nachrichten, Chats, Bots und Gruppen
  oder die mit --kind gewählten Typen. --kind message,runtime ergänzt Token-Ereignisse.
  --job verfolgt die Chats eines Auftrags; --until-settled beendet die Ausgabe mit dessen Abschluss.`,
  team: "pnpm spdbot team apply FILE | team export --out FILE   (siehe help team apply und help team export)",
  "team apply": `pnpm spdbot team apply FILE [--dry-run | --check] [--prune] [--rotate-secrets] [--wait-idle 2m]
  Den Arbeitsbereich an eine Teamdatei (YAML oder JSON) anpassen: Teams und Anweisungen, Bots,
  Skills, Stabschefs, Gruppen und Engines. Zeigt zuerst den Plan und wendet ihn dann an. Ein zweiter unveränderter Aufruf meldet „Keine Änderungen.“.
  --dry-run zeigt nur den Plan. --check endet mit 6, wenn Änderungen nötig wären.
  --prune löscht nicht aufgeführte Bots und Gruppen in Teams mit prune: true.
  Schlüssel kommen aus { env } oder { file }. Vorhandene Schlüssel bleiben ohne --rotate-secrets erhalten.
  Das Dateiformat ist in docs/headless-cli.md beschrieben.`,
  "team export": "pnpm spdbot team export [--team NAME]… --out FILE\n  Den Arbeitsbereich oder ausgewählte Teams als Teamdatei exportieren. Skills liegen daneben,\n  Schlüssel werden durch Platzhalter ersetzt und aus Persönlichkeit, Anweisungen und Skills entfernt.",
  engine: "pnpm spdbot engine set KIND … | engine list   (siehe help engine set)",
  "engine set": `pnpm spdbot engine set KIND (--key-env VAR | --key-file FILE) [--base-url URL] [--only-claude-api] [--install] [--rotate] [--dry-run]
  Einen Engine-Schlüssel einrichten: claude, openai, openrouter, openai-compatible, xai, groq, mistral oder cerebras.
  Der Schlüssel wird nie ausgegeben. Ein vorhandener Schlüssel bleibt ohne --rotate erhalten.
  --install installiert den Engine-Befehl, falls er noch nicht läuft; dadurch eignet sich der Aufruf für Startskripte.
  claude: Der Schlüssel gilt für alle Claude-Bots. --only-claude-api beschränkt ihn auf Bots mit „Claude (API key)“.`,
  "engine list": "pnpm spdbot engine list\n  Engines, ihre Verfügbarkeit und eingerichtete Schlüssel anzeigen, niemals die Schlüsselwerte.",
  connect: `pnpm spdbot connect [URL] [--code CODE] --out FILE [--label NAME] [--client] [--force]
  Einen Token für einen erreichbaren Arbeitsbereich abrufen und in FILE speichern. Nur du kannst die Datei lesen.
  Auf dem lokalen Server wird der Kopplungscode automatisch erstellt. Auf einem anderen Server erhältst du
  ihn in der Serveransicht unter Einstellungen → Fernzugriff. Anschließend: --url URL --token-file FILE oder SPDBOT_URL und SPDBOT_TOKEN.`,
  mcp: "pnpm spdbot mcp\n  Die SPDBot-MCP-Werkzeuge für einen Agenten über stdin und stdout bereitstellen (docs/mcp-server.md).",
};

export interface HeadlessOptions {
  env?: NodeJS.ProcessEnv;
  io?: HeadlessIo;
  callTool?: ClientDeps["callTool"];
  request?: ClientDeps["request"];
  /** control-omb: never change something on a server it merely found. */
  requireExplicitForMutations?: boolean;
  defaultWaitMs?: number;
  signal?: AbortSignal;
}

const VERBS: Record<string, (ctx: VerbContext) => Promise<VerbOutcome>> = {
  doctor, bots: list, channels: list, models: list, messages, send, "send-channel": send, run: runVerb, wait: waitVerb,
  interrupt, "new-bot": newBot, "new-channel": newChannel, "set-model": setModel, edit, export: exportVerb, events: eventsVerb,
  "team apply": teamApplyVerb, "team export": teamExportVerb, "engine set": engineVerb, "engine list": engineVerb, connect: connectVerb,
};

async function execute(argv: readonly string[], options: HeadlessOptions, io: HeadlessIo): Promise<{ outcome: VerbOutcome; output: Output; client?: HeadlessClient }> {
  const helpFor = argv[0] === "help" ? argv.slice(1).join(" ") : undefined;
  const parsed = helpFor !== undefined ? { verb: helpFor, flags: { help: true }, positionals: [] } : parseCommand(argv);
  const output = new Output(io, { json: parsed.flags.json === true, quiet: parsed.flags.quiet === true });
  if (parsed.flags.help) {
    const text = VERB_HELP[parsed.verb] ?? HEADLESS_USAGE;
    return { outcome: { result: { help: text }, exitCode: EXIT.done, human: [text] }, output };
  }
  if (parsed.verb === "mcp") {
    await (await loadMcp()).runStdio();
    return { outcome: { result: null, exitCode: EXIT.done, human: [], printed: true }, output };
  }
  const env = options.env ?? process.env;
  let client: HeadlessClient | undefined;
  let opening: Promise<HeadlessClient> | undefined;
  const ctx: VerbContext = {
    verb: parsed.verb, flags: parsed.flags, positionals: parsed.positionals, env, io, output,
    client: () => (opening ??= openClient(parsed.flags, { env, ...(options.callTool ? { callTool: options.callTool } : {}),
      ...(options.request ? { request: options.request } : {}), requireExplicitForMutations: options.requireExplicitForMutations === true },
    MUTATING_VERBS.has(parsed.verb)).then((opened) => (client = opened))),
    signal: options.signal ?? new AbortController().signal,
    defaultWaitMs: options.defaultWaitMs ?? 30 * 60_000,
  };
  try {
    return { outcome: await VERBS[parsed.verb]!(ctx), output, ...(client ? { client } : {}) };
  } catch (error) {
    throw await explain(error, client?.baseUrl);
  }
}

export async function runHeadlessCommand(argv: readonly string[], options: HeadlessOptions = {}): Promise<unknown> {
  const quiet: HeadlessIo = { out: () => undefined, err: () => undefined, readStdin: async () => "" };
  const { outcome } = await execute(argv, options, options.io ?? quiet);
  return outcome.result;
}

/** These stop waiting on Ctrl-C (the work goes on) and say how to pick it up again; every other verb just ends. */
const STOPS_WAITING_ON_CTRL_C: ReadonlySet<string> = new Set(["run", "wait", "events"]);

export async function runHeadless(argv: readonly string[], options: HeadlessOptions = {}): Promise<number> {
  const io = options.io ?? processIo();
  const controller = new AbortController();
  const onSignal = () => controller.abort();
  if (STOPS_WAITING_ON_CTRL_C.has(argv[0] ?? "")) process.once("SIGINT", onSignal);
  const json = argv.includes("--json");
  try {
    const { outcome, output } = await execute(argv, { ...options, signal: options.signal ?? controller.signal }, io);
    if (!outcome.printed) output.result(outcome.result, outcome.human);
    return outcome.exitCode;
  } catch (error) {
    const reported = error instanceof HeadlessError ? error : await explain(error);
    new Output(io, { json }).error(reported);
    return reported.exitCode;
  } finally {
    process.removeListener("SIGINT", onSignal);
  }
}
