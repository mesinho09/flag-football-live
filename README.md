# FLAG LIVE 🏈

Eine mobile **Flag-Football-Web-App für 8 iPhones**: 1 Schiedsrichter steuert das Match, alle weiteren Geräte verfolgen das Live-Scoreboard mit Game Clock, Play Clock, Pass Clock, Downs, Timeouts, Ballbesitz und Punkten.

## Spielregeln (eure Hausregeln)

- 4 Spieler in der Offense (1 QB + 3 Receiver), 3 in der Defense; der andere QB setzt aus.
- Kein QB-Rush. Eine **7-Sekunden-Passuhr** beginnt mit `SNAP` und kostet bei Ablauf automatisch einen Down.
- 2 × 20 Minuten; 30 Sekunden Play Clock; 2 Timeouts je Mannschaft/Halbzeit.
- 4 Downs bis zur Mittellinie, danach 4 bis zum Touchdown.
- Touchdown +6; anschließende Conversion: 1 Punkt (5 m) oder 2 Punkte (10 m). Ein defensiver Return bei einer Conversion kann +2 bringen.
- Spielstart/Ballbesitz nach Touchdown grundsätzlich eigene 5-m-Linie.
- Empfohlene Feldgröße: 50 × 20 m, inklusive zwei 5-m-Endzonen.

Dies ist **bewusst ein Hausregel-Scoreboard**, keine offizielle IFAF-Schiedsrichtersoftware. Die Feldposition (Meter / Yards) und Strafraum-Markierungen müssen die Spieler vor Ort festhalten. Die letzten 2 Minuten haben in dieser Version keine automatisch abweichenden Clock-Stopps. Beim 4. Down schaltet die Software automatisch den Ballbesitz um, wenn `Spielzug beendet` gedrückt wird; bei erreichter Mittellinie stattdessen `Mittellinie erreicht` drücken.

## Online bringen – mit Render

Ihr braucht **ein GitHub-Konto** und einen Hosting-Dienst, der Node.js und WebSockets unterstützt (z. B. Render oder Railway). Diese App ist nicht bereits online gestellt.

1. Entpacke die ZIP-Datei `flag-football-live.zip`.
2. Erstelle auf [github.com/new](https://github.com/new) ein **privates** oder öffentliches Repository und lade den **Inhalt des entpackten Ordners** hoch, also `server.js`, `game-core.js`, `package.json`, `render.yaml`, den Ordner `public` usw. Keine `node_modules` hochladen.
3. Öffne [dashboard.render.com](https://dashboard.render.com). Verbinde dein GitHub-Konto und lege ein **New Web Service** aus diesem Repository an (oder verwende die mitgelieferte `render.yaml` als Blueprint).
4. Einstellungen bei manueller Erstellung: **Runtime Node**, Build Command `npm install --omit=dev`, Start Command `npm start`. Als Region einen Standort in eurer Nähe wählen; kostenlose oder bezahlte Pläne nach aktuellen Angeboten des Hosters.
5. Nach erfolgreichem Deploy bekommst du eine HTTPS-Adresse wie `https://DEIN-SERVICE.onrender.com`. Öffne diese Adresse auf einem iPhone. Klicke **Neues Match starten**.
6. Notiere den **sechsstelligen Schiedsrichter-PIN**. Über **Einladen** teilst du den Link oder den sechsstelligen Spielcode. Die anderen sieben Spieler treten ohne PIN bei.
7. Der jeweils pausierende QB kann die Spielleitung übernehmen: Er öffnet den Spielcode **mit dem PIN** auf seinem eigenen Gerät.
8. Auf iPhone: Safari → Teilen → **Zum Home-Bildschirm** für ein App-Icon.

**Wichtig:** Der PIN ist nur für Schiedsrichter bestimmt und wird nie im Einladungslink übertragen. Der Spielcode allein gewährt nur Lesezugriff. Die aktuelle Ausführung speichert Spiele **nur im RAM des Servers**. Bei Neustart, Deployment oder Einschlafen des Servers sind alle laufenden Matches verloren; bitte die App bei kostenlosen Hosts vor dem Spiel starten und online halten. Für dauerhaft gespeicherte Spiele wäre eine Datenbank erforderlich.

## So leitet ihr das Match

1. Vor dem Snap **Spieluhr starten** (optional; der erste `SNAP` startet sie automatisch).
2. Bei jedem Snap **SNAP** drücken: Pass Clock läuft mit 7 Sekunden, Play Clock stoppt.
3. Wenn der Spielzug endet, `Spielzug beendet` drücken. Das zählt den Down weiter und startet die Play Clock neu.
4. Wird mit dem Spielzug die Mittellinie überquert, **stattdessen** `Mittellinie erreicht` drücken. Es gibt ein neues 1st Down.
5. Bei Touchdown `TOUCHDOWN +6` und dann den Extrapunktversuch wählen und abschließen. Danach wechseln Ballbesitz und Down zurück auf 1.
6. Bei Interception `INTERCEPTION / TURNOVER`, bei abgelaufenen Downs passiert der Wechsel automatisch.
7. Bei Halbzeitwechsel `2. Halbzeit`; für ein neues Match `Alles zurücksetzen`.

### Optionen

Im Schiedsrichter-Bereich unter **Regeln & Namen** kannst du Teams umbenennen und Halbzeitlänge, Play Clock und Pass Clock anpassen. Änderungen nur bei pausiertem Match vornehmen – **die Uhren werden dabei auf ihre volle Länge zurückgesetzt**.

## Lokal starten (Computer)

```bash
npm install
npm start
```

Danach `http://localhost:3000` aufrufen. Zum Testen der Regeln:

```bash
npm test
```

## Technische Umsetzung

- Backend: Node.js 20+, Express, Socket.IO (WebSocket + Fallback).
- Frontend: reines HTML/CSS/JavaScript, iPhone-optimiert; keine gesonderte App-Installation nötig.
- Server ist die Autorität für Uhren, Punkte und Downs; Gäste können nicht manipulieren.
- Die Zustände werden ca. viermal pro Sekunde an verbundene Geräte verteilt, wenn eine Uhr läuft.
- Referee-Zugriff durch einen zufälligen PIN mit einfachem Ratelimit; für private Freundesspiele gedacht, nicht für öffentliche Turniere mit anspruchsvollen Sicherheitsanforderungen.
- Ein Node-Prozess / eine Instanz; keine Cluster-/Multi-Instance-Synchronisierung. Server bei Render mit **einer Instanz** betreiben.

### Bekannte Grenzen

- Kein Langzeitspeicher: RAM-only, alle Matches gehen bei Serverneustart verloren.
- Kein exaktes Yardage-/Spotting-Tracking, nur Mittellinie / Endzone. Bei Interceptions das Spotting vor Ort selbst regeln.
- Die Game Clock läuft in der einfachen Hausregel-Variante standardmäßig weiter, bis der Schiedsrichter sie stoppt oder Halbzeit abläuft. Für komplizierte Two-Minute-Warning-Regeln muss der Schiedsrichter manuell stoppen.
- Die 7-Sekunden-Passuhr ist eine eigens gewählte Hausregel. Bei Ablauf wechselt der Down automatisch. Bei Conversion gilt der Versuch automatisch als verfehlt.
- Zwei-Punkte-Conversion nach Interception: nur bei defensivem Return bis zur gegnerischen Endzone `Defense return +2` wählen; sonst `Verfehlt`.

Lizenz: Privat zur freien Nutzung und Anpassung.
