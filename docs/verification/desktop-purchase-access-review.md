# Unabhängiger Review: Desktop-Kaufzugang

Stand: 2026-11-06. **Änderungen erforderlich: fünf bestätigte Befunde (zweimal P1, dreimal P2).** Zusätzlich bleibt die bekannte CI-/Paketierungsentscheidung offen. Der Windows-CLI-Abbruch ist reproduziert und auf den erzwungenen Prozessabschluss eingegrenzt. Es wurden keine Implementierungsänderungen vorgenommen.

Root-Nachtrag: Die folgenden Befunde beschreiben den ursprünglichen Review-Snapshot. Die fünf Korrekturen und ihre Regressionstests sind im [Integrationsbericht](desktop-purchase-access.md#root-review-fixes-2026-11-06) dokumentiert; dies ist keine unabhängige Wiederholungsprüfung.

## Basis und Integrität

- Repository: `C:/Users/Anwender/Documents/Repos/SPD-Project/SPDBot_Desktop`.
- Branch: `spd-launch-buyer-access`; unveränderte Basis/HEAD: `251739ced770a71b61e6cb0b078d854e8a28cb0f`.
- Gegenstand: exakt die **53 geänderten/unversionierten Dateien** aus `desktop-purchase-access.md`, gegen diesen HEAD. Der Reviewbericht selbst gehört nicht zum Implementierungsinventar.
- Autoritatives Inventar: `C:/Users/Anwender/AppData/Local/Temp/spdbot-desktop-access-review-20261106.json`; SHA256 `19438580fe0fe822062fc35321a7fcad8a623ce271c42fdde0ad717edfd50b5b`.
- Eingangsprüfung: **53/53 Hashes passend**, keine Abweichung; Branch und HEAD geprüft. Abschlussprüfung: **53/53 passend**, Branch/HEAD unverändert. Das vollständige Abschlussprotokoll liegt unter dem unten genannten TEMP-Verzeichnis in `inventory-final.json`.
- Tatsächlicher Website-Kontext: `SPD-Studio` bei `87606ab512b8626939a8af55d0b4238713701463`. Gelesen wurden `access-api-v1.md`, `activation.md`, `handoff.md`, `review-2026-11-06.md`, der tatsächliche Fixture-Korpus, `lib/commerce/{desktop-auth,device-proof,tokens,keyring,http,config}.ts`, relevante DTO-/Sicherheitshelfer und die konkrete Catch-all-Route. Die beiden Korpusdateien sind bytegleich: SHA256 `2637e5651c0a25b1e9557db4e08e2378f5e8831e5760c4d95b86ce7e69ba98d5`.

Geltende Repository-AGENTS.md, die mitgegebenen Arbeitsgrenzen und `SECURITY.md` wurden gelesen. Alle Arbeiten erfolgten durch einen Reviewer ohne Unteragenten. Keine Git-Index-/Ref-/Commit-/Checkout-/Push-Operation, PR-/Issue-Nachricht, Provisionierung, Deployment, echte Provider-Anfrage, Browser-/Audio-/GUI-Bedienung oder Nutzung persönlicher Profile. Die einzige neu geschriebene Repository-Datei ist dieser Bericht. Experimente verwendeten synthetische Autorität, isolierte Profile und Loopback-Dienste. Die CUA-Diagnose startete ausschließlich einen Fake-SDK, keinen echten CUA-Host.

## Bestätigte Befunde

### F1 — P1: Gültige Website-Zeitstempel verhindern die Käuferverbindung

**Ort:** `electron/purchase-client.mjs:9-13`, Aufrufer bei `connect()` und `consume()`. Produzent: `../SPD-Studio/lib/commerce/desktop-auth.ts`, insbesondere `startAuthorization()` sowie Sitzungserzeugung/`credentials()`.

`iso()` akzeptiert syntaktisch Millisekunden, verlangt anschließend aber, dass `Date.parse(value) / 1000` eine ganze Zahl ist. Die echte Website verwendet für Autorisierungsfristen und `server_time` PostgreSQL-/JavaScript-Zeitstempel mit Millisekunden. Auch `session_expires_at` behält die Millisekunden des Browser-Genehmigungszeitpunkts. Die signierten JWT-NumericDates werden dagegen korrekt auf ganze Sekunden gesetzt.

**Reproduktion:** `protocol.mjs` bündelt den tatsächlichen Website-Produzentencode. Nur DB und Rate-Limit-Persistenz werden ersetzt; DTO-Prüfung, DPoP-Verifikation und die tatsächlichen Signierfunktionen laufen. Bei festem Zeitpunkt `.123Z` produziert `startAuthorization()` gültige Werte `2030-01-01T00:10:00.123Z` und `2030-01-01T00:00:00.123Z`. Der unveränderte Desktop öffnet keine Browser-URL, behält keinen Pending-Vorgang und meldet `connection_unavailable`. Eine mit `onlineToken()`/`signedDecision()` erzeugte gültige Tokenantwort scheitert unabhängig daran mit `invalid_access_response`, sobald `session_expires_at` auf `.123Z` endet. Siehe `protocol.json`.

**Auswirkung:** Auch nach korrekter Provisionierung kann die normale Käuferverbindung scheitern. Die bisherige FakeAuthority arbeitet mit ganzen Sekunden und verdeckt beide Stellen.

**Kleinste Korrektur:** ISO-Zeitpunkte als solche validieren und ihre Millisekunden verarbeiten; absolute Sicherheitsfristen beim Übergang in ganzzahlige Sekunden konservativ abrunden. JWT-NumericDates weiterhin streng ganzzahlig prüfen. Einen Produzent-/Konsumententest mit nichtnull Millisekunden für Autorisierungsstart und Sitzung ergänzen.

### F2 — P1: CUA-Retry startet den Host trotz aktiver Kaufsperre

**Ort:** `electron/cua.mjs:350-351` und `:380-408` (direkter `startCua()`-Aufruf bei `:390`); exponiert über `electron/preload.cjs:138-142` als `window.ogb.localControl.retry()`.

Die neue Kaufprüfung schützt nur `cua:connection`. Der bereits vorhandene Retry-Handler für Windows/macOS führt weiterhin `stopCua()` und anschließend `startCua()` aus, ohne `executionAllowed()` zu prüfen. Derselbe lokale Renderer, der ohne Kaufzugang die Einstellungsoberfläche verwenden darf, erreicht diesen Handler. Ein so gestarteter Host wird nicht beim nächsten unverändert gesperrten Status automatisch wieder gestoppt: `executionChanged(false)` läuft nur bei Zustandswechseln. `persistAndNotify()` speichert zudem den aktiven Deskriptor und meldet ihn an den bestehenden Main-Listener.

**Reproduktion:** `cua-diagnostic.mjs` führt eine unveränderte TEMP-Kopie des echten CUA-Moduls aus, ersetzt ausschließlich Electron und den nativen SDK durch instrumentierte Fakes und injiziert `executionAllowed: async () => false`. Ergebnis: `cua:connection` meldet `purchase-access-required`; derselbe Sender erhält bei Retry `{enabled:true,status:"ready"}`, der Fake-Host startet **einmal**, und die Zahl der Kaufprüfungen während Retry ist **null**. Siehe `cua-diagnostic.json`.

**Auswirkung:** Die zugesicherte Sperre des nativen CUA-Host-Lebenszyklus lässt sich über die reguläre IPC-Brücke rückgängig machen. Das ist kein Ersetzen des Programms durch einen lokalen Administrator. Tatsächliche Maus-/Tastaturaktionen wurden bewusst nicht ausgeführt; ein uneingeschränkter Provider- oder Backend-Bypass wird daraus nicht behauptet.

**Kleinste Korrektur:** Alle IPC-Pfade, die CUA starten/aktivieren/wiederholen können, vor dem Start und nach asynchronem Warten prüfen; Stop/Disable verfügbar lassen. Eine Sperre während des Starts muss den Start abbrechen. Gemeinsame Startlogik auch auf den ursprünglichen Remote-/Plattformkontext begrenzen. Regression: Retry nach Start ohne Kauf und nach Entzug darf keinen Host starten und keinen aktiven Deskriptor publizieren.

### F3 — P2: Asynchrone Lease-Prüfung kann eine neue Ausführung erst nach Ablauf zulassen

**Ort:** `server/purchase-access.ts:90-98`, verbrauchender Dispatch `server/purchase-provider.ts:16-19`.

`check()` erfasst `now` vor der asynchronen Signaturprüfung. Nach deren Abschluss werden Epoche, Security-Objekt und Lock geprüft, aber weder die aktuelle Zeit noch ein inzwischen erkannter Uhrfehler. Dadurch kann `assert()` erfolgreich zurückkehren, obwohl die Lease inzwischen abgelaufen ist. Der Provider-Wrapper ruft direkt danach den echten Adapter auf. Seine nachträgliche Prüfung liefert zwar 402 und stoppt, kann den bereits gestarteten Effekt aber nicht verhindern.

**Reproduktion:** `adversarial.mjs` initialisiert den echten `PurchaseGate` mit gültigem Besitznachweis und signierter Lease. Es startet `purchaseProvider(...).adapter.sendTurn()`, schiebt die Fake-Uhr während der ausstehenden Prüfung exakt auf `exp` und wartet auf das Ergebnis. Der Adapter wird **einmal bei `effectTime === leaseExpiry === 1893715200`** aufgerufen; erst danach folgt `purchase_access_required` mit Stop-Aufrufen. Siehe `adversarial.json`, Feld `race`.

**Auswirkung:** Ein konkretes Zeitfenster an der Ablaufgrenze erlaubt einen neuen Provider-Auftrag nach der Frist. Dies verlängert keine gespeicherte Lease unbegrenzt; es verletzt die exakte Zulassungsgrenze und kann einen externen Effekt vor der nachträglichen Stornierung auslösen.

**Kleinste Korrektur:** Nach dem Verifizieren aktuelle Zeit, Rollback und absolute Sitzungsfrist erneut prüfen. Unmittelbar vor dem synchronen Aufruf des Adapters nach dem letzten `await` zusätzlich `assertNow()` verwenden. Auch Main-Statusberechnungen dürfen das vor ihrem `await` ermittelte Erlaubnis-/Zeitbild nicht ungeprüft zurückgeben. Eine Regression muss **null Adapteraufrufe** fordern, wenn Ablauf bereits während der Zulassungsprüfung eintritt.

### F4 — P2: Gesprächsexport und Nutzungs-CSV bleiben gesperrt; der CLI-Test prüft einen leeren Export

**Ort:** `server/purchase-access.ts:15-19`. Bestehende reine Exportpfade: `server/routes/threads.ts:437` und `server/routes/usage.ts:22-33`. Unzureichende Assertion: `server/purchase-bypass.e2e.test.ts` am Ende des CLI-/Exporttests.

Die korrigierte Allowlist enthält Suche und Workspace-Backup, aber weiterhin weder `GET /api/threads/:id/export` noch `GET /api/usage.csv`. Damit blockiert die neue Kaufsperre etablierte Markdown-/JSON-Gesprächsexporte und den CSV-Download aus der Nutzungsansicht. Die zugehörigen Leseansichten funktionieren weiterhin. Bestehende Session-/Scope-/Sichtbarkeitsprüfungen liegen auch nach einer gezielten Freigabe weiter vor den Exporthandlern.

**Reproduktion:** `export-diagnostic.mjs` startet den kopierten aktuellen Server mit getrennten synthetischen HOME-/Datenpfaden. `/api/usage` und `/api/threads/:id/messages` liefern 200; `/api/usage.csv`, `/api/threads/:id/export` und dessen JSON-Variante liefern jeweils **402**. Ein anschließender CLI-Export meldet Exit 0/`ok:true`, aber **`transcripts:[]`, `bytes:0` und `skipped` mit dem 402-Fehler**. Für diese Diagnose wurde nur der erzwungene CLI-Prozessabschluss in der TEMP-Kopie entfernt, um Problem B getrennt zu halten. Der bestehende Harness-Test prüft lediglich, dass der Ordner `transcripts` existiert; der Export legt ihn auch ohne exportierte Gespräche an. Siehe `export-diagnostic.json`.

**Auswirkung:** Die zugesagte Verfügbarkeit des eigenen Gesprächs-/Datenexports bei gesperrter Ausführung ist nicht vollständig erfüllt. Ein erfolgreicher verschlüsselter Gesamtbackup ersetzt diese vorhandenen Exportfunktionen nicht.

**Kleinste Korrektur:** Die exakten GET-Exportpfade freigeben und die bestehenden Autorisierungen beibehalten. Den CLI-Test auf mindestens eine tatsächliche Transkriptdatei mit der bekannten Fixture-Nachricht und ohne Export-Skip prüfen; beide HTTP-Formate und CSV direkt testen. Keine pauschale Freigabe beliebiger GETs oder aller Data-/Datei-Endpunkte.

### F5 — P2: Nach unterbrochener Speicherung fehlt ein nutzbarer Wiederherstellungsweg

**Ort:** `electron/purchase-client.mjs:37-60`, `:110-112`, `:197-209`; UI `src/components/PurchaseAccessBar.tsx:23-26`; Journalprüfung in `electron/purchase-store.mjs`.

Das Journal schließt nach einem unterbrochenen Update korrekt fail-closed. Beim folgenden Neustart scheitert `store.read()` jedoch vor Übernahme des alten Records. Der Client bleibt `enabled:false`, `connected:false`, mit `secure_storage_unavailable`. „Verbinden“ kehrt wegen `!enabled` sofort zurück; „Trennen“ ist im Renderer wegen `connected:false` verborgen. Selbst ein direkt aufgerufenes `signOut()` löscht zwar das Journal, setzt `enabled` anschließend wieder auf den vorherigen Wert `false`. Im laufenden Prozess ist danach weiterhin keine Verbindung möglich.

**Reproduktion:** `adversarial.mjs` verbindet einen frischen Client über die FakeAuthority und den echten AES-verschlüsselten Atomic Store, lässt einen Refresh-Schreibvorgang künstlich scheitern, stellt die Verschlüsselung wieder her und startet einen neuen Client. Vor/nach `connect()` bleibt der beschriebene Sperrzustand bestehen. Auch nach direktem `signOut()` bleibt `clientEnabled:false`; es wird lediglich die Fehlermeldung entfernt. Siehe `adversarial.json`, Feld `recovery`.

**Auswirkung:** Ein normaler unterbrochener Schreibvorgang kann die Käuferverbindung über die sichtbaren Aktionen dauerhaft festsetzen. Manuelles Löschen der Zugangsdateien oder ein Entwickler-IPC-Aufruf mit anschließendem Neustart wäre nötig. Es wurde kein unsicheres Wiederherstellen der alten Berechtigung beobachtet.

**Kleinste Korrektur:** Für diesen Fehlerzustand eine sichere Zugangszurücksetzung über die bestehende UI anbieten, die nur Kaufzustand/Journal löscht und danach Trust sowie verfügbare Speicherung neu initialisiert. Keine alte Lease oder rotierende Credential wiederverwenden, keine Workspace-/Providerdaten löschen. Wiederverbindung im selben Prozess und nach Neustart testen.

## Bekannte Root-Integrationen

### A — Paketierungs-Guard und bestehende CI

**Bestätigt, weiterhin offen.** `scripts/before-pack-purchase.mjs` ruft `validateAuthority()` auf und weist die absichtlich leeren Pins mit `access_unavailable` zurück. `electron-builder.yml:28` hängt diesen Guard in jede normale Paketierung ein. Die unveränderte CI ruft in `.github/workflows/ci.yml:597` weiterhin `pnpm package:linux:offline` auf. Ein Runtime-Diff kann diese Paketqualifikation im aktuellen Zustand nicht bestehen. Die Artefaktprüfung beweist gerade den erwarteten Guard-Fehler; sie beweist keine erfolgreiche Paketierung.

Das ist eine beabsichtigte Aktivierungs-/Releasevoraussetzung mit einem ungelösten Workflow-Konflikt, keine Aufforderung, die Sperre zu entfernen. Konkrete sichere Wege:

1. Vor regulärer Paketqualifikation tatsächlich provisionierte **öffentliche** aktuelle/nächste Pins reviewen und im Build hinterlegen. Die Desktop-Paketierung benötigt keine privaten Autoritätsschlüssel. Diese Option bleibt bis zur echten Provisionierung blockiert; synthetische Shipping-Pins sind ungeeignet.
2. Für Voraktivierungs-CI eine ausdrücklich separate, nicht veröffentlichbare Paket-Validierungsfixture mit unverändert leeren Runtime-Pins einsetzen. Sie darf nur den gesperrten Zustand qualifizieren; normale Releasekonfiguration und deren Guard bleiben unverändert. Build-/Upload-/Releasepfade müssen eine Verwechslung ausschließen. Ausführungstests nutzen weiterhin getrennte Source-Fixtures. Das ist eine gezielte CI-Änderung, keine grüne Wiederholung des bisherigen aktiven Linux-Paketsmokes.
3. Bis eine dieser Änderungen entschieden/implementiert ist, Paket-/Releasequalifikation ausdrücklich als blockiert melden. Ein stilles Skip mit Erfolgsbehauptung oder ein allgemeines Env-/CLI-Bypassflag würde die Zusicherung schwächen.

Keine dieser Optionen wurde umgesetzt. Linux ist kein zugesagtes Verkaufsziel, sein vorhandener erforderlicher CI-Pfad bleibt dennoch ein Integrationsvertrag des Repositories.

### B — Windows-CLI-Abbruch nach gültigem Bots-JSON

**Ursache eingegrenzt; minimale Korrektur experimentell nachgewiesen.** Der aktuelle kopierte Server und die aktuelle CLI reproduzieren auf Node **24.19.0** Windows den Fehler **3/3**: vollständiges gültiges Bots-JSON, danach Exit **3221226505** und zuvor vom Reporter unterschlagenes stderr:

```text
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 94
```

`doctor` endet mit 0. Eine TEMP-Variante, die den vorhandenen `process.exit(code)` in `server/exit.ts` nur um ein `setImmediate` verschiebt, scheitert ebenfalls **3/3**. Eine TEMP-Variante, die `process.exitCode` setzt und den Prozess nach dem Stream-Flush natürlich auslaufen lässt, liefert für `bots` **3/3 Exit 0**, identisches JSON und leeres stderr. Ein kleiner Fake-HTTP-Dienst löste den Abbruch dagegen in keiner Variante aus. Belege: `cli-diagnostic.json`, `packaged-diagnostic.json`.

Die Aussage „unveränderter CLI-Code“ ist hier überprüft: Der exakt mit dem vorhandenen Buildrezept in TEMP erzeugte CLI-Bundle ist **bytegleich** zum verwendeten `dist-server/spdbot.js`, SHA256 `010b097653707ce4b3c03e702aef959035bd25c4e4bc22fd1d98cd6f8c23116d`. Seine **672 Eingaben überlappen mit keiner der 53 geänderten Dateien**. Die CLI-/Headless-/MCP-/Exit-Quellen sind gegen HEAD unverändert. Das ist belastbare Abgrenzung des Aufrufers; ein vollständiger Vorher-Server wurde nicht gestartet und die konkrete native Handle-Art hinter der libuv-Assertion nicht weiter bestimmt.

**Kleinste nachgewiesene Richtung:** Endliche Headless-Verben nach gesetztem Exitcode und abgeschlossenem Stream-Flush natürlich beenden; übrige Aufrufer des gemeinsamen Exit-Helfers vor einer globalen Änderung auf absichtlich offene Handles prüfen. Im Smoke `bots.stderr` aufnehmen. Kein Kaufguard muss dafür abgeschaltet werden. Der gesamte originale Packaged-Smoke bleibt bis zum echten Fix und anschließender erfolgreicher Wiederholung **fehlgeschlagen**, nicht nachträglich grün.

Roots Suche-/Backup-Fix ist bestätigt: Die fokussierten Tests bestehen; außerdem erzeugte der kopierte gesperrte Server mit getrenntem HOME einen verschlüsselten Backup-Export mit **HTTP 200**, Download **200**, **197180 Bytes** und Präfix `OMB-WORKSPACE-1\n`. Upload/Restore bleiben in den fokussierten Tests 402. Der zusätzliche Exportfehler F4 bleibt davon unabhängig.

## Tatsächlich ausgeführte Checks

Diagnosen und Logs liegen ausschließlich auf dem ursprünglichen Windows-Prüfrechner unter `C:/Users/Anwender/AppData/Local/Temp/spdbot-access-independent-review-20261106`; sie gehören nicht zum Checkout. Alle dort genannten `.mjs`-Diagnosen sind erneut mit Node ausführbar; `adversarial.mjs` und `body-diagnostic.mjs` benötigen die vorhandene TypeScript-Strip-Unterstützung. Arbeitsverzeichnis ist das Desktop-Repository. Die Diagnosen führen keine Source-Fixes aus.

| Check | Ergebnis |
| --- | --- |
| `node --test electron/purchase-access.node-test.mjs` | **104 bestanden**, `consumer.log` |
| Vitest: `server/purchase-access.test.ts`, `server/purchase-bypass.e2e.test.ts`, `server/workspace-backup-http.test.ts` | **21 bestanden**, `vitest.log`; F4 zeigt eine konkret unzureichende bestehende Exportassertion |
| Vitest: `server/routes/threads-export.test.ts` | **1 bestanden**, `export-routes.log`; der zusätzlich angegebene nicht vorhandene Usage-Testfilter führte zu keiner zweiten Suite |
| Vitest: `scripts/testing/verification-docs.test.ts` | **7 bestanden**, `docs.log` |
| `node scripts/check-purchase-artifacts.mjs` | **Bestanden**, Electron-Importgraph und **949** gebaute UI-/Core-Artefakte, inklusive erwarteter Ablehnung leerer Shipping-Pins |
| JOSE in Memory mit unverändertem Bundlerezept neu erzeugt | **Bytegleich** zum vendorten Modul; Version **6.2.10**; MIT-Lizenz bytegleich zur installierten Dependency; `provenance.json` |
| Tatsächlicher Website-Produzent gegen Desktop | **F1 reproduziert**, `protocol.json` |
| CUA-IPC mit Fake-Electron/Fake-SDK | **F2 reproduziert**, `cua-diagnostic.json`; keine native Steuerung |
| Echt verifizierter Gate-/Provider-Aufruf über Ablaufgrenze und verschlüsselter Journal-Neustart | **F3/F5 reproduziert**, `adversarial.json` |
| Verzögerter echter HTTP-Body, Ablauf vor letztem Chunk | **402, null Effekte**, `body-diagnostic.json`; echter `purchase-http.readBody`, ausschließlich prozessinterne Testinjektion des verifizierten Gates |
| Kopierter aktueller Server außerhalb des Repositories, keine node_modules in seinem Auflösungspfad | **F4/B reproduziert**, verschlüsseltes Gesamtbackup/Download erfolgreich; `export-diagnostic.json`, `packaged-diagnostic.json` |
| Drei betroffene unveränderte Electron-Suites | **24 Tests: 18 bestanden, 2 übersprungen, 4 fehlgeschlagen**; `unchanged-host-tests.log` |
| Whitespace und abschließendes Inventar | `git diff --check` bestanden; alle 53 Implementierungsdateien unverändert |

Die vier Electron-Fehler wurden hier erneut beobachtet: zwei `symlink`-`EPERM` bereits beim Fixture-Aufbau (`cloud-sync-engine.node-test.mjs:80`, `cloud-sync-scan.node-test.mjs:15`), zweimal `mv`-`ENOENT` in den AppImage-Fällen (`vendor-updater.node-test.mjs:91`, `:147`). Die genannten Test-/Implementierungsdateien einschließlich vendortem Updater und Patchscript wurden mit HEAD verglichen: keine Änderung. Die konkreten Ausfallstellen benötigen keine Kaufmodule. Damit ist die Host-/Prerequisitenzuordnung für diese vier Fehler belegt; die vollständige **937/16/4-aus-957**-Suite wurde nicht erneut ausgeführt.

Die gemeldeten vollständigen Lint-/Type-/i18n-/Build- und nativen Windows-Checks sowie die achtteilige **81+11**-Vitest-Ausführung wurden anhand der Quellen/Evidenz bewertet, aber nicht pauschal neu zertifiziert. Keine erneuten Vollbuilds, keine Paketierung, kein nativer Mac- oder echter Provider-/Clerk-/Stripe-Test. Preflight des Security-Diff-Skills war mit Python 3.13 `ready`, im vorgeschriebenen Einzelreviewer-Fallback. Der erste Python-3.10-Aufruf fehlte wegen `tomllib`/`tomli`; korrigierte reine Diagnose-Start-/Shellfehler wurden nicht als Produktfehler gezählt. Es wurde kein gesonderter verwalteter Security-Scan oder SARIF-Abschluss behauptet.

## Vollständige 53-Dateien-Abdeckung

Jede der folgenden Dateien wurde im Diff oder als neue Datei gelesen; generierte JOSE-Bytes zusätzlich vollständig aus der gepinnten Dependency reproduziert, der Korpus vollständig durch die 104 Consumer-Fälle ausgeführt. Unterstützende unveränderte Pfade wurden nur für die geänderten Vertrauens-/Ausführungs-/Export-/Buildpfade verfolgt.

| Gruppe | Exakte Dateien | Prüfschwerpunkte |
| --- | --- | --- |
| Dokumentation (2) | `docs/verification/README.md`; `docs/verification/desktop-purchase-access.md` | Manifest, behauptete Nachweise und Einschränkungen; widersprechende Export-/Integrationsaussagen oben korrigiert |
| Electron-Einbindung (5) | `electron-builder.yml`; `electron/cua.mjs`; `electron/main.mjs`; `electron/preload.cjs`; `electron/window-state-persistence.mjs` | Originale Single-Instance-/Deep-Link-Reihenfolge; Main-Frame/Sender; CUA-Lebenszyklus und F2; Auslagerung der bisherigen Fensterpersistenz ohne Datenmigration; Packaging/Edition-Ausschlüsse |
| Trust/JOSE (4) | `electron/purchase-authority.d.mts`; `electron/purchase-authority.mjs`; `electron/purchase-jose.mjs`; `electron/vendor/purchase-jose.mjs` | Leere Pins fail-closed; Umgebung/Zweck/Key-ID; keine Laufzeit-Trustoption; vollständige Reproduzierbarkeit |
| Client/Clock/Store/Desktop (5) | `electron/purchase-client.mjs`; `electron/purchase-clock.d.mts`; `electron/purchase-clock.mjs`; `electron/purchase-desktop.mjs`; `electron/purchase-store.mjs` | F1/F5; PKCE, URL/Origin, Callback-Claim, Queues, Logout/Refresh, keine Replay-Erneuerung; effektive Uhr und Journal; privater Parent-Port und Deskriptor-Synchronisierung |
| Wire/Verifier (4) | `electron/purchase-verifier.d.mts`; `electron/purchase-verifier.mjs`; `electron/purchase-wire.d.mts`; `electron/purchase-wire.mjs` | Strikte JSON-/Claimtypen und Header, Signaturen/Identitäten, 259200s/86400s, Sitzungsgrenze; unterschiedliche installierte/beobachtete/Denial-Watermarks und Wiederherstellung |
| Server (7) | `server/desktop-private-message.ts`; `server/index.ts`; `server/purchase-access.ts`; `server/purchase-background.ts`; `server/purchase-http.ts`; `server/purchase-provider.ts`; `server/purchase-runtime.ts` | F3/F4; private Challenge/Signatur, direkter Turn-/Providerpfad, HTTP/Upgrade/SSE, späte Bodies, Routinen/Background, Stop/Restore und bestehende Autorisierung |
| Produktionsprüfscripts (3) | `scripts/before-pack-purchase.mjs`; `scripts/bundle-purchase-jose.mjs`; `scripts/check-purchase-artifacts.mjs` | CI-Konflikt A; tatsächliche Artefakte, Fixture-Ausschluss und Dependency-Reproduzierbarkeit |
| UI/Typen/Sprachen (9) | `shared/purchase-access.ts`; `src/App.tsx`; `src/components/PurchaseAccessBar.tsx`; `src/components/onboarding/WelcomeGate.tsx`; `src/lib/purchase-access.ts`; `src/locales/de.json`; `src/locales/en.json`; `src/locales/source-hashes.json`; `src/types/ogb.d.ts` | Redigierter Zustand und Aktionen, Remote-Client-Grenze, Onboarding, F5-Aktionsverfügbarkeit, neun konsistente neue DE/EN-Schlüssel/Hashes; keine visuelle Zertifizierung |
| Consumer-/Korpustests (3) | `electron/purchase-access.node-test.mjs`; `electron/testing/purchase/access-v1.json`; `electron/testing/purchase/fake-authority.mjs` | 104 ausgeführte Fälle, alle 23 Lease-Korpusfälle, Grenzen der Ganzsekunden-FakeAuthority, keine Shipping-Trustquelle |
| Harness-/Ratchet (2) | `scripts/control-omb.ts`; `scripts/testing/file-size-ratchet.test.ts` | Fresh-profile-Marker/Source-only-Loader, Restricted-Modus, unveränderte Scope-/Datenisolation, neue Modulgrößen |
| Native Testquellen (3) | `scripts/testing/purchase-native-main.mjs`; `scripts/testing/purchase-native-ui.tsx`; `scripts/testing/run-purchase-native.mjs` | Richtiger SafeStorage-Rückgabetyp, echte IPC-/UtilityProcess-Testarchitektur, isolierte Profile und ausschließlich Testtrust; Prüfung der Quellen statt erneuter GUI-Ausführung |
| Backendtests/-Fixtures (5) | `server/purchase-access.test.ts`; `server/purchase-bypass.e2e.test.ts`; `server/testing/purchase-authority.mjs`; `server/testing/purchase-native-child.ts`; `server/testing/purchase-parent.mjs` | Fokussierte Tests ausgeführt; falsche positive Exportassertion; Constructor-/Loadertrust nur in ausgeschlossenen Fixtures; Backend-Besitznachweis bleibt echte Verifikation |
| Lizenz (1) | `third_party/jose/LICENSE.md` | MIT-Text/Urheber bytegleich; Packaging nimmt Lizenz zusätzlich auf |

Summe: **53/53**. Unterstützend geprüft wurden insbesondere die originale Request-/Owner-/Session-/Sichtbarkeitsauthentifizierung, `routes/table.ts`, `routes/upgrades.ts`, `routes/threads.ts`, `routes/usage.ts`, `data/routes.ts`, Workspace-Backup, Registry-/Adapterverträge, Headless-Export/CLI/Exit, CUA-Verbindungsspeicher, Server-Bundler/tsconfig und CI. Die Retail-`local.run`-Lease verändert keine Enterprise-Entitlements; der bestehende Enterprise-Codeausschluss aus der Distribution bleibt erhalten. LICENSE/NOTICE werden weiterhin eingebunden.

## Verworfene Kandidaten und verbleibende Grenzen

- Keine bestätigte Remote-Umgehung durch unsigned IPC-/HTTP-Claims, manipulierte JWT-/DPoP-Header, kopierte Leases ohne Schlüsselbesitz, Callback-Replay, einen normalen Neustart oder Netzwerkfehler. Strenge Claimtypen, Purpose-/Environment-Pins, unabhängige Backend-Verifikation und Denial-Watermarks wurden im begrenzten Scope nachvollzogen. Das ersetzt keine Aussage, dass jeder denkbare Angriff ausgeschlossen sei.
- Öffentliche Health-/Brand-/Umgebungs-/Auth-/OAuth-Vorpfade wurden vor dem gemeinsamen Dispatch geprüft; sie sind kein nachgewiesener alternativer Turnpfad. Bestehende Owner-/Session-/Capability-/Enterprise-Prüfungen werden durch eine aktive Retail-Lease nicht zu neuen Rechten.
- Die Body-Nachprüfung verweigert die vollständig erst nach Ablauf eingetroffene Mutation. Die getrennte Signatur-Zeitlücke F3 besteht trotzdem. Bereits laufende Routinen, Streams und Adapterstopps sind durch die fokussierten Fake-Tests abgedeckt; echte Provider-Stornierung kann abgeschlossene oder gerade externe Effekte nicht zurücknehmen.
- F2 belegt den ungeschützten nativen Host-Startpfad ohne echte Desktopsteuerung. macOS-Keychain, OS-Protokollregistrierung, Installer/Signierung/Notarisierung, voller Main-Lebenszyklus, echtes Suspend/Resume und vollständige native Windows-/Mac-Pakete bleiben unbestätigt. Der separate Mac-Polish auf älterem Main ist kein Kaufzugangsnachweis.
- Website-Konfiguration/Clerk/Stripe/DB/Signierautorität und reale öffentliche Pins sind Aktivierungsabhängigkeiten. Es wurden weder Gerätezahl noch Support-/Refundregel erfunden oder geändert. Angebot: einmal EUR 99, Windows/macOS, eigene AI-Konten.
- Lokale Administratoren können Code ersetzen oder einen ganzen Maschinenzustand zurücksetzen. Diese bekannte Softwaregrenze ist kein neuer Befund. Die hier gemeldeten Fehler benötigen keine solche Codeersetzung.

Keine Source-Korrektur oder Git-Veröffentlichung erfolgte. Ein Buyer-Access-PR wird nicht behauptet; Hintergrund-PR16 und dessen Watcher wurden nicht berührt.
