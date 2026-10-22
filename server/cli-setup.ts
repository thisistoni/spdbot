// Guided setup stays outside server/index: no server, store, or bot is started
// until the user has saved a connection and explicitly starts the application.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  DATA_DIR, instanceConfigs, loadConfig, parseStoredConfig, saveConfig,
  stripWorkspaceCredentialEnv, PROVIDER_CREDENTIAL_ENV, type AppConfig,
} from "./config.ts";
import type { InstanceConfig, ModelCatalog, ProviderSnapshot } from "./contracts.ts";
import { acquireDataDirLease } from "./data-dir-lease.ts";
import { augmentedPath, resetPathCache } from "./env-path.ts";
import { resolveCli } from "./procs.ts";
import { ProviderRegistry } from "./harness/registry.ts";
import { BUILT_IN_DRIVERS } from "./drivers/builtIn.ts";
import { defaultSetupIo, SetupCancelled, type SetupIo } from "./cli-prompts.ts";
import { API_ENDPOINTS, fetchSetupModels, normalizeApiUrl, verifySetupCompletion } from "./cli-api-setup.ts";

type Inspection = { snapshot: ProviderSnapshot; models: ModelCatalog };
interface SetupDependencies {
  inspect(id: string, entry: InstanceConfig): Promise<Inspection>;
  runCli(cli: string, args: string[], environment?: Record<string, string>): Promise<void>;
  models: typeof fetchSetupModels;
  verify: typeof verifySetupCompletion;
}

async function inspect(id: string, entry: InstanceConfig): Promise<Inspection> {
  const registry = new ProviderRegistry(BUILT_IN_DRIVERS);
  try {
    await registry.load({ [id]: entry });
    const provider = registry.get(id);
    if (!provider) throw new Error("Diese Anbieterkonfiguration konnte nicht geladen werden. Prüfe sie in den Einstellungen der App.");
    const snapshot = await provider.snapshot();
    return { snapshot, models: provider.models };
  } finally {
    await registry.disposeAll();
  }
}

/** Native CLIs own their OAuth flow; no tokens pass through our prompts. */
export async function runSetupCli(cli: string, args: string[], environment: Record<string, string> = {}): Promise<void> {
  const env: NodeJS.ProcessEnv = { ...process.env, ...environment, PATH: augmentedPath() };
  stripWorkspaceCredentialEnv(env);
  for (const key of PROVIDER_CREDENTIAL_ENV) delete env[key];
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  const command = resolveCli(cli, args);
  await new Promise<void>((done, reject) => {
    const child = spawn(command.command, command.args, { env, stdio: "inherit" });
    child.once("error", () => reject(new Error(`${cli} konnte nicht gestartet werden. Prüfe, ob es installiert und über PATH erreichbar ist.`)));
    child.once("exit", (code, signal) => {
      if (code === 0) done();
      else if (signal === "SIGINT" || code === 130) reject(new SetupCancelled());
      else reject(new Error(`${cli} wurde nicht erfolgreich beendet. Behebe den oben angezeigten Fehler und versuche es erneut.`));
    });
  });
  resetPathCache();
}

const dependencies: SetupDependencies = { inspect, runCli: runSetupCli, models: fetchSetupModels, verify: verifySetupCompletion };

function assertDataDir(dataDir: string): void {
  if (resolve(dataDir) !== resolve(DATA_DIR)) throw new Error("Das Datenverzeichnis stimmt nicht mit dem der Einrichtung überein. Starte die CLI mit --data-dir neu.");
}

// loadConfig tolerates a broken file at boot; an onboarding write must refuse one rather than replace its contents.
function checkStoredConfig(dataDir: string): void {
  try {
    parseStoredConfig(JSON.parse(readFileSync(join(dataDir, "config.json"), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new Error("Die vorhandene config.json konnte nicht gelesen oder geprüft werden. Die Einrichtung hat sie nicht verändert. Repariere sie, bevor du fortfährst.");
  }
}

export async function isSetupComplete(dataDir: string): Promise<boolean> {
  assertDataDir(dataDir);
  checkStoredConfig(dataDir);
  const cfg = loadConfig();
  const saved = cfg.defaultModelSelection;
  const instances = instanceConfigs(cfg);
  return !!(saved && Object.hasOwn(instances, saved.instanceId) && instances[saved.instanceId]?.enabled !== false);
}

export function readCliStartup(dataDir: string): AppConfig["cliStartup"] {
  assertDataDir(dataDir);
  checkStoredConfig(dataDir);
  return loadConfig().cliStartup;
}

export function saveCliStartup(dataDir: string, settings: NonNullable<AppConfig["cliStartup"]>): void {
  assertDataDir(dataDir);
  const lease = acquireDataDirLease(dataDir);
  try {
    checkStoredConfig(dataDir);
    saveConfig({ cliStartup: settings });
  } finally {
    lease.release();
  }
}

function rawObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function chooseModel(io: SetupIo, models: ModelCatalog): Promise<string> {
  if (!models.options.length) throw new Error("Diese Verbindung hat keine Modelle geliefert. Prüfe den Anbieter und versuche es erneut.");
  let query = "";
  for (;;) {
    const matches = models.options.filter((m) => `${m.label} ${m.id}`.toLowerCase().includes(query.toLowerCase()));
    const preferred = matches.find((m) => m.id === models.default);
    const visible = (preferred ? [preferred, ...matches.filter((m) => m !== preferred)] : matches).slice(0, 20);
    const defaultIndex = visible.findIndex((m) => m.id === models.default);
    const selected = await io.choose("Wähle dein Modell", [
      ...visible.map((m) => m.label.trim() || m.id),
      "Modelle suchen…",
    ], defaultIndex < 0 ? undefined : defaultIndex);
    if (selected < visible.length) return visible[selected]!.id;
    query = (await io.ask("Modellname oder Teil der ID (Enter zeigt alle): ")).trim();
  }
}

const NATIVE = [
  { id: "codex", driver: "codex", label: "ChatGPT / Codex – mit deinem Konto anmelden", cli: "codex", pkg: "@openai/codex" },
  { id: "claude", driver: "claudeAgent", label: "Claude Code – mit deinem Konto anmelden", cli: "claude", pkg: "@anthropic-ai/claude-code" },
] as const;

async function connectNative(
  choice: typeof NATIVE[number], id: string, entry: InstanceConfig, io: SetupIo, deps: SetupDependencies,
): Promise<ModelCatalog> {
  const cli = typeof rawObject(entry.config).cli === "string" ? rawObject(entry.config).cli as string : choice.cli;
  io.log("Dein Konto wird verbunden…");
  io.log("Die Anmeldung erfolgt bei deinem Anbieter. Es gelten dessen Kontolimits; SPDBot fragt niemals nach deinem Passwort.");
  let state = await deps.inspect(id, entry);
  if (state.snapshot.state !== "available") {
    if (cli !== choice.cli) throw new Error("Dein benutzerdefinierter CLI-Pfad ist nicht verfügbar. Korrigiere ihn in den Einstellungen, bevor du die Einrichtung erneut startest.");
    if (!await io.confirm(`${choice.cli} mit npm install -g ${choice.pkg} installieren?`, true)) throw new SetupCancelled();
    await deps.runCli("npm", ["install", "-g", choice.pkg]);
    state = await deps.inspect(id, entry);
    if (state.snapshot.state !== "available") throw new Error(`${choice.cli} ist weiterhin nicht verfügbar. Prüfe die Ausgabe der Installation und versuche es erneut.`);
  }
  if (!state.snapshot.authenticated) {
    let args = ["auth", "login"];
    if (choice.id === "codex") {
      const method = await io.choose("Wie möchtest du dich anmelden?", [
        "Browser auf diesem Computer öffnen", "Gerätecode verwenden (SSH / entfernter Server)",
      ], process.env.SSH_CONNECTION ? 1 : 0);
      args = method === 1 ? ["login", "--device-auth"] : ["login"];
    }
    if (args.includes("--device-auth")) io.log("Aktiviere die Anmeldung per Gerätecode in den Sicherheitseinstellungen von ChatGPT, falls dein Konto dies verlangt.");
    await deps.runCli(cli, args, entry.environment);
    state = await deps.inspect(id, entry);
    if (state.snapshot.state !== "available" || !state.snapshot.authenticated) {
      throw new Error("Die Anmeldung wurde nicht bestätigt. Deine SPDBot-Einstellungen sind unverändert. Schließe die Anmeldung beim Anbieter ab und versuche es erneut.");
    }
  } else {
    io.log("Vorhandene Anmeldung gefunden. Du musst dich nicht erneut anmelden.");
  }
  if (state.snapshot.update) io.log(`${state.snapshot.update.title}: ${state.snapshot.update.command}`);
  io.log("Anmeldung bestätigt. Der Anbieter prüft den Modellzugriff, wenn du deine erste Nachricht sendest.");
  return state.models;
}

export async function runSetup(
  options: { dataDir: string; port: number },
  io: SetupIo = defaultSetupIo(),
  deps: SetupDependencies = dependencies,
): Promise<boolean> {
  assertDataDir(options.dataDir);
  const lease = acquireDataDirLease(options.dataDir);
  try {
    checkStoredConfig(options.dataDir);
    const cfg = loadConfig();
    const runtime = instanceConfigs(cfg);
    const existing = Object.entries(runtime).filter(([id, entry]) =>
      !!cfg.instances?.[id] && ["codex", "claudeAgent", "openai-compat"].includes(entry.driver) && entry.enabled !== false);
    io.log("\nWillkommen bei SPDBot\n");
    io.log("Verbinde deine KI. Wähle zuerst einen Anbieter, dann ein Modell.");
    io.log("Vorhandene Bots und Gespräche bleiben unverändert. Ctrl-C bricht die Einrichtung ab.");
    io.log("Du kannst später Integrationen hinzufügen und Einstellungen ändern.\n");
    const existingDefault = existing.findIndex(([id]) => id === cfg.defaultModelSelection?.instanceId);
    const providerOptions = [
      ...NATIVE.map((n) => n.label),
      "API-Schlüssel – OpenAI, OpenRouter, Groq oder ein kompatibler Dienst (nur Chat)",
      ...existing.map(([id, entry]) => `Vorhandene Verbindung verwenden: ${entry.displayName ?? id}${id === cfg.defaultModelSelection?.instanceId ? " – aktuell" : ""}`),
    ];
    let pick: number | undefined;

    let id: string;
    let entry: InstanceConfig;
    let model: string;
    for (;;) {
      pick ??= await io.choose("Wähle deine KI-Verbindung", providerOptions, existingDefault < 0 ? 0 : existingDefault + 3);
      const prior = pick >= 3 ? existing[pick - 3] : undefined;
      const native = pick < 2 ? NATIVE[pick] : NATIVE.find((n) => n.driver === prior?.[1].driver);
      try {
        if (native) {
          // Reuse native provider settings; an ID the user repurposed keeps its connection.
          id = prior?.[0] ?? native.id;
          if (!prior && runtime[id] && runtime[id]!.driver !== native.driver) id = `${native.id}-${randomUUID().slice(0, 8)}`;
          entry = { ...(cfg.instances?.[id] ?? { driver: native.driver }), enabled: true };
          const models = await connectNative(native, id, entry, io, deps);
          const saved = cfg.defaultModelSelection;
          model = await chooseModel(io, {
            ...models,
            default: saved?.instanceId === id ? saved.model : models.default,
          });
        } else {
          io.log("API-Schlüssel verbinden");
          io.log("API-Nutzung wird getrennt von ChatGPT-/Claude-Abos abgerechnet.");
          io.log("Diese Verbindung unterstützt Chat und freigegebene MCP-Werkzeuge, wenn das Modell Werkzeugaufrufe unterstützt. Die direkte Computersteuerung erfordert eine andere Engine.");
          let url: string;
          let key: string;
          let label: string;
          let reuse = false;
          let routingProvider: string | undefined;
          if (prior) {
            const config = rawObject(prior[1].config);
            const decoded = BUILT_IN_DRIVERS.find((d) => d.driverKind === "openai-compat")!.decodeConfig(config);
            url = normalizeApiUrl(decoded.url);
            key = decoded.key ?? prior[1].environment?.[decoded.apiKeyEnv]
              ?? prior[1].environment?.OPENAI_COMPAT_API_KEY
              ?? process.env[decoded.apiKeyEnv] ?? process.env.OPENAI_COMPAT_API_KEY ?? "";
            routingProvider = decoded.provider;
            label = prior[1].displayName ?? prior[0];
            reuse = !!key;
            if (!key) key = (await io.secret(`API-Schlüssel für ${url} (verdeckt): `)).trim();
          } else {
            const endpoint = await io.choose("Welcher API-Dienst?", [...API_ENDPOINTS.map((e) => e.label), "Anderer OpenAI-kompatibler Endpunkt"]);
            const preset = API_ENDPOINTS[endpoint];
            url = preset ? preset.url : normalizeApiUrl((await io.ask("API-Basis-URL (einschließlich /v1): ")).trim());
            label = preset?.label ?? new URL(url).hostname;
            if (preset) io.log(`Schlüssel erstellen: ${preset.keyUrl}`);
            key = (await io.secret(`API-Schlüssel für ${url} (verdeckt): `)).trim();
          }
          if (!key) throw new Error("Ein API-Schlüssel ist erforderlich. Es wurde nichts gespeichert.");
          io.log("Modellkatalog wird geprüft…");
          let models: ModelCatalog["options"];
          try { models = await deps.models(url, key); }
          catch (error) {
            if (error instanceof SetupCancelled) throw error;
            io.log(error instanceof Error ? error.message : "Dieser Modellkatalog konnte nicht geladen werden.");
            if (!await io.confirm("Stattdessen eine genaue Chat-Modell-ID eingeben und direkt prüfen?", false)) throw error;
            const manual = (await io.ask("Chat-Modell-ID: ")).trim();
            if (!manual) throw new Error("Eine Modell-ID ist erforderlich. Es wurde nichts gespeichert.");
            models = [{ id: manual, label: manual }];
          }
          const previousModel = prior ? rawObject(prior[1].config).model : undefined;
          const preferredModel = cfg.defaultModelSelection?.instanceId === prior?.[0]
            ? cfg.defaultModelSelection?.model : previousModel;
          io.log("Wähle ein Chat-Modell. Reine Bild-, Audio- und Embedding-Modelle können hier nicht antworten.");
          model = await chooseModel(io, { default: typeof preferredModel === "string" ? preferredModel : "", options: models });
          if (!await io.confirm("Eine kurze Testnachricht senden? Dein API-Anbieter kann diese Anfrage berechnen.", true)) throw new SetupCancelled();
          if (routingProvider) await deps.verify(url, key, model, routingProvider);
          else await deps.verify(url, key, model);
          io.log("Testantwort erhalten.");
          // API additions never change the URL or key behind an existing bot, and a new instance inherits no global overrides.
          id = reuse && prior ? prior[0] : `api-${randomUUID().slice(0, 8)}`;
          entry = reuse && prior
            ? { ...cfg.instances![id]!, config: { ...rawObject(cfg.instances![id]!.config), model } }
            : { driver: "openai-compat", displayName: label, config: { url, key, model, provider: routingProvider ?? "" } };
          if (!reuse) io.log("Der Schlüssel wird in deiner privaten config.json gespeichert (im Klartext, unter Unix nur für den Dateieigentümer zugänglich). Teile diese Datei niemals.");
        }
        break;
      } catch (error) {
        if (error instanceof SetupCancelled) throw error;
        io.log(error instanceof Error ? error.message : "Diese Verbindung konnte nicht eingerichtet werden.");
        io.log("Deine gespeicherte Verbindung und dein Modell sind unverändert.");
        const recovery = await io.choose("Was möchtest du tun?", [
          "Diese Verbindung erneut versuchen", "Andere Verbindung oder anderen API-Schlüssel wählen", "Einrichtung abbrechen",
        ], 0);
        if (recovery === 2) throw new SetupCancelled();
        if (recovery === 1) pick = undefined;
      }
    }

    io.log(`\nStandard für neue Bots: ${entry.displayName ?? id} / ${model}`);
    if (!await io.confirm("Diese Einrichtung speichern?", true)) throw new SetupCancelled();
    // An explicit fleet starts from an empty config's defaults, not instanceConfigs(cfg), whose env holds secrets.
    const instances = { ...(cfg.instances && Object.keys(cfg.instances).length ? cfg.instances : instanceConfigs({})), [id]: entry };
    saveConfig({ instances, defaultModelSelection: { instanceId: id, model } });
    io.log("\nEinrichtung gespeichert. Vorhandene Bots und Gespräche wurden nicht verändert.");
    return true;
  } catch (error) {
    if (!(error instanceof SetupCancelled)) throw error;
    io.log("\nEinrichtung abgebrochen. Es wurden keine SPDBot-Einstellungen verändert. Bereits abgeschlossene Anmeldungen oder Installationen beim Anbieter bleiben bestehen.");
    return false;
  } finally {
    lease.release();
  }
}
