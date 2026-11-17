# Kapitel 10 · Live-Rangliste auf Netlify veröffentlichen

## Ordnerinhalt

```
kapitel10-netlify/
├── index.html, style.css, script.js     ← die Lern-App
├── netlify/functions/leaderboard.mjs    ← Backend (GET/POST Rangliste)
├── package.json                         ← installiert @netlify/blobs
└── netlify.toml                         ← sagt Netlify, wo was liegt
```

> **Wichtig:** Netlify Drop (Ordner ins Browserfenster ziehen) lädt **keine Functions** hoch.
> Die Seite läuft dann zwar, aber die Rangliste fällt automatisch auf «Offline/lokal» zurück.
> Für die echte Klassen-Rangliste brauchst du Weg A oder B.

## Weg A – über GitHub (empfohlen, kein Node.js auf deinem PC nötig)

1. Auf github.com ein neues Repository anlegen, z. B. `kapitel10`.
2. Den **Inhalt** des Ordners `kapitel10-netlify` hochladen («Add file → Upload files»).
   Der Unterordner `netlify/functions/` muss mit hochgeladen werden.
3. Auf app.netlify.com: **Add new site → Import an existing project → GitHub** → Repository wählen.
4. Die Einstellungen kommen automatisch aus `netlify.toml`. Einfach **Deploy** klicken.
5. Netlify installiert `@netlify/blobs` selbst und richtet den Speicher automatisch ein.

Jede Änderung, die du später auf GitHub hochlädst, wird automatisch neu veröffentlicht.

## Weg B – mit der Netlify CLI (braucht Node.js)

```bash
npm install
npx netlify-cli login
npx netlify-cli deploy --prod
```

Beim ersten Mal fragt die CLI, ob eine neue Seite erstellt werden soll. Bestätige mit «Create & configure a new site».

## Lokal testen

- `index.html` direkt öffnen → alles funktioniert, die Rangliste zeigt «Offline» (lokale Rangliste).
- Mit Node.js: `npx netlify-cli dev` → startet die Seite inkl. Function und einem lokalen Blob-Speicher.

## Nach dem Veröffentlichen prüfen

- `https://DEINE-SEITE.netlify.app/.netlify/functions/leaderboard` aufrufen →
  es muss JSON erscheinen, z. B. `{"ok":true,"day":"2026-11-17",...,"entries":[]}`.
- In der App bei der Rangliste erscheint oben der grüne **Live**-Punkt.

## Einträge verwalten

Netlify → deine Seite → **Blobs** → Store `kapitel10-leaderboard`.
Pro Tag gibt es einen Eintrag (`JJJJ-MM-TT`). Löschst du ihn, ist die Tages-Rangliste leer.

Optional: Unter **Site configuration → Environment variables** eine Variable `K10_SALT`
mit einem beliebigen geheimen Text anlegen (macht die anonymisierten Netzwerk-Kennungen sicherer).
