// Real app startup and settings against an isolated fake-engine workspace.
import { launchVerificationServer, runControlOmb } from "./control-omb.ts";
import { fixtureApi, mountPreview, parkUntilSignal, type MountedPreview } from "./testing/preview-fixture.ts";

const fixture = await launchVerificationServer({
  ...process.env,
  FAKE_CLAUDE_REPLIES: JSON.stringify([
    "## Dein Überblick\n\nDie Aufgaben für heute sind vorbereitet.\n\n- Kalender prüfen\n- Entwurf für die Teambesprechung lesen\n- Nächste Schritte gemeinsam abstimmen\n\n| Aufgabe | Status |\n| --- | --- |\n| Design prüfen | Bereit |\n| Notizen sortieren | Erledigt |\n\n```ts\nconst theme = 'spd';\n```\n\nDies sind synthetische Daten für die Designprüfung.",
  ]),
});
let ui: MountedPreview | undefined;
try {
  const api = fixtureApi(fixture.info.url);
  const control = (args: string[]) => runControlOmb([...args, "--url", fixture.info.url]);
  await api("PATCH", "/api/config", { language: "de" });
  await control(["new-bot", "--name", "Design-Assistent"]);
  const { bots } = await api("GET", "/api/bots?messages=0");
  const bot = bots.find((item: { name: string }) => item.name === "Design-Assistent");
  await control(["send", "--bot", bot.id, "--text", "Zeig mir bitte die Aufgaben für heute."]);
  const settled = await control(["wait", "--bot", bot.id, "--timeout", "30"]);
  ui = await mountPreview(fixture, {
    entry: "/src/main.tsx", route: "/__spd-theme.html", title: "SPDBot · SPD theme verification",
  });
  console.log(JSON.stringify({ ...fixture.info, previewUrl: ui.previewUrl, botId: bot.id, settled }));
  await parkUntilSignal();
} finally {
  await ui?.close();
  await fixture.close();
}
