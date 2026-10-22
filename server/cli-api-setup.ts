// Stateless onboarding probes: the caller owns consent for the metered call; credentials and replies are never logged.
export const API_ENDPOINTS = [
  { id: "openai", label: "OpenAI API", url: "https://api.openai.com/v1", keyUrl: "https://platform.openai.com/api-keys" },
  { id: "openrouter", label: "OpenRouter", url: "https://openrouter.ai/api/v1", keyUrl: "https://openrouter.ai/settings/keys" },
  { id: "groq", label: "Groq", url: "https://api.groq.com/openai/v1", keyUrl: "https://console.groq.com/keys" },
  { id: "meta", label: "Meta Model API", url: "https://api.meta.ai/v1", keyUrl: "https://dev.meta.ai/" },
] as const;

export function normalizeApiUrl(value: string): string {
  const input = value.trim();
  const invalid = () => new Error("Gib eine HTTPS-API-Basis-URL ohne Zugangsdaten, Suchparameter oder Fragment ein. HTTP ist nur für localhost erlaubt.");
  let url: URL;
  try { url = new URL(input); } catch { throw invalid(); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    // Reject invisible URL characters and ambiguous authority/path separators.
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u0020\u007f\\?#]/u.test(input) || url.username || url.password ||
    input.slice(input.indexOf("://") + 3).split("/")[0]?.includes("@") ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && local))
  ) throw invalid();
  return url.href.replace(/\/+$/u, "");
}

class SetupApiError extends Error {}

function httpFailure(status: number, completion: boolean): SetupApiError {
  const prefix = `Die API antwortete mit HTTP ${status}.`;
  if (status === 401 || status === 403) return new SetupApiError(`${prefix} Prüfe den API-Schlüssel und seine Zugriffsrechte.`);
  if (status === 402) return new SetupApiError(`${prefix} Prüfe das Guthaben und die Abrechnungseinstellungen beim Anbieter.`);
  if (status === 429) return new SetupApiError(`${prefix} Ein Anfrage- oder Kontingentlimit wurde erreicht. Prüfe Guthaben und Limits und versuche es später erneut.`);
  if (status >= 300 && status < 400) return new SetupApiError(`${prefix} Weiterleitungen werden nicht verfolgt. Verwende die direkte API-Basis-URL des Anbieters.`);
  if (completion && [400, 404, 422].includes(status)) return new SetupApiError(`${prefix} Prüfe Modell-ID und Zugriffsrechte oder wähle ein Modell, das Chat Completions unter dieser API-URL unterstützt.`);
  if (status === 404) return new SetupApiError(`${prefix} Prüfe die API-Basis-URL: Sie muss einen /models-Endpunkt bereitstellen.`);
  if (status >= 500) return new SetupApiError(`${prefix} Der Anbieter ist nicht verfügbar. Versuche es später erneut.`);
  return new SetupApiError(`${prefix} Prüfe die API-URL und die Anbietereinstellungen und versuche es erneut.`);
}

async function setupJson(url: string, key: string, body?: Record<string, unknown>): Promise<unknown> {
  const base = normalizeApiUrl(url);
  // Existing credentials are tested exactly as the runtime sends them, never silently repaired only here.
  const token = key;
  // Header credentials must not contain control characters or whitespace.
  // eslint-disable-next-line no-control-regex
  if (!token || /[\u0000-\u0020\u007f]/u.test(token)) throw new SetupApiError("Gib einen nicht leeren API-Schlüssel ohne Leerzeichen oder Zeilenumbrüche ein.");
  const completion = body !== undefined;
  const operation = completion ? "Die Testantwort" : "Die Modellliste";
  const timeoutMs = completion ? 30_000 : 8_000;
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(`${base}${completion ? "/chat/completions" : "/models"}`, {
          method: completion ? "POST" : "GET",
          headers: { authorization: `Bearer ${token}`, ...(completion ? { "content-type": "application/json" } : {}) },
          ...(completion ? { body: JSON.stringify(body) } : {}),
          signal: abort.signal,
          redirect: "error",
        });
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          throw httpFailure(response.status, completion);
        }
        try { return await response.json(); }
        catch { throw new SetupApiError(`${operation} enthielt ungültiges JSON. Prüfe, ob die API-URL die OpenAI-kompatible API unterstützt.`); }
      })(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(new SetupApiError(`${operation} hat nach ${timeoutMs / 1000} Sekunden das Zeitlimit überschritten. Prüfe die Verbindung und versuche es erneut.`));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof SetupApiError) throw error;
    // fetch errors can carry a URL, echoed credentials or provider content: expose neither message nor cause.
    throw new SetupApiError("Die API ist nicht erreichbar. Prüfe das Netzwerk und die direkte API-URL; Weiterleitungen werden nicht verfolgt.");
  } finally {
    clearTimeout(timer);
  }
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

export async function fetchSetupModels(url: string, key: string): Promise<Array<{ id: string; label: string }>> {
  const json = record(await setupJson(url, key));
  const models = new Map<string, { id: string; label: string }>();
  for (const entry of Array.isArray(json?.data) ? json.data : []) {
    const item = record(entry);
    const id = typeof item?.id === "string" ? item.id.trim() : "";
    // Model IDs and display labels reach the terminal; block control sequences.
    // eslint-disable-next-line no-control-regex
    if (!id || /[\u0000-\u001f\u007f]/u.test(id) || models.has(id)) continue;
    // eslint-disable-next-line no-control-regex
    const name = typeof item?.name === "string" ? item.name.replace(/[\u0000-\u001f\u007f]/gu, "").trim() : "";
    models.set(id, { id, label: name || id });
  }
  if (!models.size) throw new SetupApiError("Die API hat keine nutzbaren Modelle geliefert. Prüfe API-URL und Modellzugriff oder gib eine Modell-ID deines Anbieters manuell ein.");
  return [...models.values()];
}

/** Call only after consent, passing the effective instance's provider routing. */
export async function verifySetupCompletion(url: string, key: string, model: string, provider?: string): Promise<void> {
  const id = model.trim();
  // Keep manually entered IDs safe to show in the terminal and saved setup.
  // eslint-disable-next-line no-control-regex
  if (!id || /[\u0000-\u001f\u007f]/u.test(id)) throw new SetupApiError("Wähle eine nicht leere Modell-ID ohne Steuerzeichen.");
  const host = new URL(normalizeApiUrl(url)).hostname.toLowerCase();
  // The same OpenRouter-only provider pin as OpenAICompatDriver, without its environment overrides.
  const pinProvider = provider && (host === "openrouter.ai" || host.endsWith(".openrouter.ai"));
  const json = record(await setupJson(url, key, {
    model: id,
    messages: [{ role: "user", content: "Reply with exactly OK." }],
    stream: false,
    ...(pinProvider ? { provider: { order: [provider], allow_fallbacks: false } } : {}),
  }));
  const choice = record(Array.isArray(json?.choices) ? json.choices[0] : undefined);
  const message = record(choice?.message);
  if (message?.role !== "assistant" || typeof message.content !== "string" || !message.content.trim()) {
    throw new SetupApiError("Die API hat keine Textantwort des Assistenten geliefert. Wähle ein Modell, das Chat Completions unterstützt, und versuche es erneut.");
  }
}
