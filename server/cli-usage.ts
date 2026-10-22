export { HEADLESS_VERBS as HEADLESS_VERB_NAMES } from "./headless/args.ts";

export const HEADLESS_USAGE = `Einen laufenden Arbeitsbereich steuern (Skripte, CI, andere Agenten):
  pnpm spdbot doctor                    Serververbindung und verfügbare Engine prüfen
  pnpm spdbot bots | channels | models  Bots, Gruppen, Engines und Modelle anzeigen
  pnpm spdbot run BOT "Aufgabe"         einen Auftrag starten und auf alle beteiligten Bots warten
  pnpm spdbot send BOT "Text"           eine Nachricht senden und sofort zurückkehren
  pnpm spdbot wait BOT                  auf bereits laufende Arbeit warten
  pnpm spdbot messages BOT              die letzten Nachrichten eines Chats anzeigen
  pnpm spdbot interrupt BOT [--tree]    stoppen (--tree: auch alle beteiligten Bots)
  pnpm spdbot export BOT --out DIR      Chatverläufe, Dateien und Bildschirmbilder nach DIR exportieren
  pnpm spdbot events [--job THREAD]     Live-Ereignisse des Servers als JSON-Zeilen ausgeben
  pnpm spdbot team apply FILE           den Arbeitsbereich an eine Teamdatei anpassen
  pnpm spdbot engine set claude --key-env ANTHROPIC_API_KEY   Engine ohne Oberfläche einrichten
  pnpm spdbot connect URL --code CODE --out FILE              Token für einen anderen Arbeitsbereich abrufen
  pnpm spdbot new-bot | new-channel | set-model | edit | mcp

  Server: --url URL (oder SPDBOT_URL), --port N, sonst dieser Computer.
  Token: SPDBOT_TOKEN oder --token-file FILE. --json gibt ein JSON-Dokument aus.
  Fortschritt erscheint auf stderr; --quiet blendet ihn aus.
  Details zu einem Befehl: pnpm spdbot help VERB.`;

export const USAGE = `SPDBot: dein Team aus KI-Bots

Befehle im Projektverzeichnis ausführen:
  pnpm spdbot                         einmal einrichten, danach den Arbeitsbereich öffnen
  pnpm spdbot setup [--data-dir DIR]
  pnpm spdbot start [dieselben Optionen wie serve]
  pnpm spdbot serve [--port 8899] [--data-dir DIR] [--label NAME]
                    [--public-url https://host] [--tailscale | --domain HOST] [--no-pair]
  pnpm spdbot pair [--label NAME] [--client] [--phone ios|android] [--public-url https://host]
  pnpm spdbot sessions [revoke ID]
  pnpm spdbot status
  pnpm spdbot access list | add EMAIL [--chat-only] | remove EMAIL
  pnpm spdbot service install [--domain HOST | --tailscale] [--port N] [--data-dir DIR] | uninstall
                    [--sentinel]
  pnpm spdbot sentinel [--data-dir DIR] [--out DIR] [--once] [--json]
  pnpm spdbot browser install [--with-deps] | status

setup   KI-Zugang und optionalen Telefonzugriff einrichten. Bestehende Bots und Chats bleiben erhalten.
start   Gespeicherte Einstellungen verwenden und den Arbeitsbereich öffnen, wie pnpm spdbot.
serve   Server ohne Rückfragen starten und einen Kopplungslink mit QR-Code ausgeben.
pair    Kopplungscode von einem laufenden Server abrufen. --client erlaubt nur Chats und Freigaben.
sessions Gekoppelte Geräte anzeigen. Mit sessions revoke ID ein Gerät abmelden.
status  Informationen des Servers anzeigen.
access  Festlegen, wer sich unter /pair per E-Mail-Code anmelden darf: eine Adresse oder @domain.
        --chat-only erlaubt Chats und Freigaben, aber keine Einstellungen. Änderungen gelten sofort.
service Server nach Neustarts automatisch starten. Erstellt eine systemd-Unit (Linux) oder
        einen launchd-Agenten (macOS) und zeigt die Installationsbefehle an.
        Verwende einen dauerhaft vorhandenen Projektordner, keinen temporären Paketcache.
        --sentinel richtet stattdessen alle zwei Minuten eine schreibgeschützte Zustandsprüfung ein.
sentinel Schreibgeschützte Zustandsprüfung. Weitere Optionen stehen unter --help.
browser install installiert die festgelegte Version von agent-browser im Datenverzeichnis und
        Chrome for Testing im Browsercache des Benutzers. --with-deps installiert zusätzlich
        die benötigten Linux-Bibliotheken und muss dafür einmal als root ausgeführt werden.
        Führe browser install anschließend als der Benutzer aus, der auch serve startet.
        status zeigt die vorhandene Installation für diesen Benutzer und dieses Datenverzeichnis.

--tailscale  Zugriff über dein Tailnet. Tailscale stellt HTTPS bereit; der Link verwendet den
             MagicDNS-Namen dieses Computers. Tailscale muss angemeldet sein und HTTPS-Zertifikate
             müssen für das Tailnet aktiviert sein.
--domain     Zugriff über https://HOST auf deiner eigenen Domain. Eine festgelegte Caddy-Version
             wird einmal heruntergeladen, läuft neben dem Server und bezieht das Zertifikat.
             Richte den DNS-Eintrag auf diesen Computer aus und öffne die Ports 80 und 443.

--no-open   Kein Browserfenster öffnen.
--no-pair   Telefoneinrichtung überspringen und keinen Kopplungscode ausgeben.
--local     Diesmal lokal starten; gespeicherte Fernzugriffseinstellungen nicht verwenden.

${HEADLESS_USAGE}

Voraussetzung: Node 24+ und die in package.json festgelegte pnpm-Version.
SPDBot wird aus diesem Projekt mit pnpm spdbot gestartet. Es gibt kein veröffentlichtes npm-Paket.
`;
