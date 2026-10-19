# ShoeTracker (eng)

Simple, efficient and private mileage counter for running shoes as an installable PWA without account or server nor tracking. Works offline and all data remains on the device.

**--> Live:** https://weekendcompiler.github.io/ShoeTracker/

## Features

- Add shoes and enter details (model, brand, wear limit, starting mileage,purchase date, price, emoji)
- Log runs with distance, date, and notes
- Wear status per shoe can be defined: as a recommendation up to 25% "Fresh", up to 75% "Good", from 75% to 90% "Due soon", above 90% "Worn Out"
- Sort via drag & drop or arrow keys, archive, delete (with undo)
- Statistics, CSV export, JSON backup, and restore
- German and English (automatic based on system language, switchable), light and dark theme
- Kilometer or miles as well as currency selectable (EUR, USD, GBP, SEK, NOK, DKK, ISK, CAD, AUD, NZD, JPY, CHF) – internally always stored in km
- All settings (language, distance, currency, individual mileage thresholds, theme) centrally located behind the gear icon in the top right
- Offline operation and automatic updates via Service Worker

## Quick Start

No dependencies, no build. A local HTTP server is sufficient (Service Worker and installability are missing under `file://`):

```bash
python3 -m http.server 8000
# http://localhost:8000/
```

## Project Structure

```
index.html              App (markup, icon sprite, JSON-LD)
faq.html                FAQ in German (+ FAQPage JSON-LD)
datenschutz.html        Privacy policy in German
en/faq.html             FAQ in English
en/privacy.html         Privacy policy in English
assets/js/boot.js       Runs blocking in <head>: theme, language, onboarding flag, beforeinstallprompt
assets/js/i18n.js       UI strings in German/English
assets/js/app.js        Application logic (one IIFE, ES5 style, no dependencies)
assets/css/app.css      Design tokens and components
assets/icons/           App icons, derived from newappicon.png
assets/og/og-image.png  Preview image for shared links, rendered from tools/og-image.html
sw.js                   Service Worker (offline cache, updates)
manifest.webmanifest    PWA metadata
sitemap.xml, robots.txt, llms.txt   SEO and crawlers
_headers                Security headers (only for Netlify/Cloudflare Pages, not GitHub Pages)
```

## Architecture

The state consists of two arrays, `state.shoes` and `state.runs`. Mileage is never stored; it is calculated from `initialKm` and runs. The order of `state.shoes` is the display order.

The workflow is the same everywhere: **Action → modify `state` → `save()` → `render*()` → `showToast()`**. `switchTab()` re-renders the visible tab; whoever changes the state globally (e.g., during import) calls `switchTab(ui.tab)`.

Core rules:

- **Validation only in `normalize()`.** Everything from storage or backup goes through there; the rest of the app trusts the data.
- **No `innerHTML`.** User text only via `textContent` or `el(tag, class, text)`.
- **Strict CSP.** No inline scripts, no `eval`, no external sources.
- **`localStorage` only via `storage` object.** In private mode or full storage, the app continues and warns via toast.
- **Listeners only in `bindEvents()`**, via delegation on the container.
- **Accessibility (WCAG 2.2 AA):** Keyboard paths for everything (including tabs via arrow keys), visible focus, contrast ≥ 4.5:1.
- **Comments in English**, with important ones marked with `WARNING:` or `INFO:`.

## Data Storage and Compatibility

Everything is stored in `localStorage`:

| Key | Content |
| --- | --- |
| `schuh_tracker_data` | Shoes and runs (JSON) |
| `schuh_tracker_theme` | `light` or `dark` |
| `schuh_tracker_onboarded` | `1`, when onboarding is complete |
| `schuh_tracker_lang` | `de` or `en` |

> **Important:** Storage keys, backup format (`{ app, version: 1, exportedAt, shoes, runs }`), hash routes (`#schuhe`, `#lauf` – opens the shoe list since the run tab was removed –, `#statistik`), and German CSV format are public interfaces for existing installations. New fields require a fallback in `normalize()` that reads old data without migration.

## Multilingual

The HTML contains German text (for crawlers and without JS). Elements with `data-i18n="key"` or `data-i18n-attr="aria-label=key,…"` are populated from `assets/js/i18n.js`; in JS, `t('key', { placeholder })` translates. New texts always add to **both** languages. FAQ and privacy policy are currently German only.

## Deployment (GitHub Pages)

All paths are relative; the app runs directly in the project subdirectory. For any changes to delivered files:

1. Increase `VERSION` in `sw.js`, otherwise installed apps keep the old cache.
2. Add new files to the `SHELL` list in `sw.js`.
3. New version is automatically activated; the app only reloads when no dialog is open and no input is active, otherwise on the next switch to background.

Absolute URLs (for relocation or custom domain): `canonical`, `hreflang` links, `og:url`, `og:image`, `twitter:image` in all HTML pages as well as `sitemap.xml`, `robots.txt`, and `llms.txt`.

Notes:

- `robots.txt` is only read in the domain root (`weekendcompiler.github.io/robots.txt`); submit the sitemap directly in Google Search Console.
- GitHub Pages ignores `_headers`; only the `<meta>` CSP applies there.
- Visible FAQ text and `FAQPage` JSON-LD in `faq.html` and `en/faq.html` must remain word-for-word identical.
- FAQ and privacy policy exist per language as separate pages (German in root, English under `en/`). Always apply content changes to both versions; pages reference each other via `hreflang`, `data-href` carries the relative path for redirection in `boot.js`.
- Data is stored per origin. Moving to another domain starts empty for users; they must export a backup beforehand.

## Icons and Preview Image

All icon variants (favicon, header, PWA, maskable, Apple Touch) are derived from `assets/icons/newappicon.png`: red design on black background. For the maskable icon, the design must stay within the central 80% safe zone. The preview image is rendered from `tools/og-image.html` (1200×630, Headless Chrome). Colors follow the icon red; text and primary colors are checked for WCAG-AA contrast.

## Pre-Deploy Checklist

- Test via `http://localhost` (not `file://`), check console for CSP errors
- Play through once in a private window (blocked storage)
- View both languages and both themes
- Is `VERSION` in `sw.js` increased?



# ShoeTracker (deu)

Einfacher, effizienter und privater Kilometerzähler für Laufschuhe als installierbare PWA ohne Konto, Server oder Tracking. Funktioniert offline und alle Daten bleiben auf dem Gerät.

**Live:** https://weekendcompiler.github.io/ShoeTracker/

## Funktionen

- Schuhe anlegen und Details eingeben (Modell, Marke, Verschleißgrenze, Startkilometer, Kaufdatum, Preis, Emoji)
- Läufe mit Distanz, Datum und Notizen eintragen
- Verschleißstatus pro Schuh: als Empfehlung bis 25 % „Frisch“, bis 75 % „Gut“, von 75 % bis 90 % „Bald fällig“, über 90 % „Verschlissen"
- Sortieren per Drag & Drop oder Pfeiltasten, archivieren, löschen (mit Rückgängig)
- Statistik, CSV-Export, JSON-Backup und Wiederherstellung
- Deutsch und Englisch (automatisch basierend auf der Systemsprache, umschaltbar), helles und dunkles Design
- Kilometer oder Meilen sowie Währung wählbar (EUR, USD, GBP, SEK, NOK, DKK, ISK, CAD, AUD, NZD, JPY, CHF) – intern immer in km gespeichert
- Alle Einstellungen (Sprache, Distanz, Währung, individuelle Verschleißschwellen, Design) zentral hinter dem Zahnrad-Icon oben rechts
- Offline-Betrieb und automatische Updates per Service Worker

## Schnellstart

Keine Abhängigkeiten, kein Build. Ein lokaler HTTP-Server reicht (Service Worker und Installierbarkeit fehlen unter `file://`):

```bash
python3 -m http.server 8000
# http://localhost:8000/
```

## Projektstruktur

```
index.html              App (Markup, Icon-Sprite, JSON-LD)
faq.html                FAQ (inkl. FAQPage-JSON-LD)
datenschutz.html        Datenschutzerklärung
en/faq.html             FAQ auf Englisch
en/privacy.html         Datenschutzerklärung auf Englisch
assets/js/boot.js       Läuft blockierend im <head>: Theme, Sprache, Onboarding-Flag, beforeinstallprompt
assets/js/i18n.js       UI-Texte Deutsch/Englisch
assets/js/app.js        Anwendungslogik (eine IIFE, ES5-Stil, keine Abhängigkeiten)
assets/css/app.css      Design-Tokens und Komponenten
assets/icons/           App-Icons, abgeleitet aus newappicon.png
assets/og/og-image.png  Vorschaubild für geteilte Links, gerendert aus tools/og-image.html
sw.js                   Service Worker (Offline-Cache, Updates)
manifest.webmanifest    PWA-Metadaten
sitemap.xml, robots.txt, llms.txt   SEO und Crawler
_headers                Security-Header (nur für Netlify/Cloudflare Pages, nicht GitHub Pages)
```

## Architektur

Der Zustand besteht aus zwei Arrays, `state.shoes` und `state.runs`. Kilometerstände werden nie gespeichert, sondern aus `initialKm` und den Läufen berechnet. Die Reihenfolge von `state.shoes` ist die Anzeigereihenfolge.

Der Ablauf ist überall gleich: **Aktion → `state` ändern → `save()` → `render*()` → `showToast()`**. `switchTab()` rendert den sichtbaren Tab neu; wer den Zustand global ändert (z. B. beim Import), ruft `switchTab(ui.tab)` auf.

Grundregeln:

- **Validierung nur in `normalize()`.** Alles aus Speicher oder Backup läuft dort durch; der Rest der App vertraut den Daten.
- **Kein `innerHTML`.** Nutzertext nur über `textContent` bzw. `el(tag, class, text)`.
- **Strikte CSP.** Kein Inline-Script, kein `eval`, keine externen Quellen.
- **`localStorage` nur über das `storage`-Objekt.** Im privaten Modus oder bei vollem Speicher läuft die App weiter und warnt per Toast.
- **Listener nur in `bindEvents()`**, per Delegation auf den Container.
- **Barrierefreiheit (WCAG 2.2 AA):** Tastaturpfade für alles (inkl. Tabs per Pfeiltasten), sichtbarer Fokus, Kontrast ≥ 4,5:1.
- **Kommentare auf Englisch**, wichtige mit `WARNING:` oder `INFO:` markiert.

## Datenhaltung und Kompatibilität

Alles liegt im `localStorage`:

| Schlüssel | Inhalt |
| --- | --- |
| `schuh_tracker_data` | Schuhe und Läufe (JSON) |
| `schuh_tracker_theme` | `light` oder `dark` |
| `schuh_tracker_onboarded` | `1`, wenn die Einführung erledigt ist |
| `schuh_tracker_lang` | `de` oder `en` |

> **Wichtig:** Speicherschlüssel, Backup-Format (`{ app, version: 1, exportedAt, shoes, runs }`), Hash-Routen (`#schuhe`, `#lauf` – öffnet seit Wegfall des Lauf-Tabs die Schuhliste –, `#statistik`) und das deutsche CSV-Format sind für bestehende Installationen öffentliche Schnittstelle. Neue Felder brauchen in `normalize()` einen Fallback, der alte Daten ohne Migration gültig liest.

## Mehrsprachigkeit

Das HTML enthält den deutschen Text (für Crawler und ohne JS). Elemente mit `data-i18n="key"` bzw. `data-i18n-attr="aria-label=key,…"` werden aus `assets/js/i18n.js` befüllt; im JS übersetzt `t('key', { platzhalter })`. Neue Texte immer in **beiden** Sprachen anlegen. FAQ und Datenschutz sind nur auf Deutsch.

## Deployment (GitHub Pages)

Alle Pfade sind relativ, die App läuft direkt im Projektunterverzeichnis. Bei jeder Änderung an ausgelieferten Dateien:

1. `VERSION` in `sw.js` erhöhen, sonst behalten installierte Apps den alten Cache.
2. Neue Dateien in die `SHELL`-Liste in `sw.js` eintragen.
3. Neue Version wird automatisch aktiviert; die App lädt erst neu, wenn kein Dialog offen ist und keine Eingabe läuft, sonst beim nächsten Wechsel in den Hintergrund.

Absolute URLs (für Umzug oder eigene Domain): `canonical`, `hreflang`-Links, `og:url`, `og:image`, `twitter:image` in allen HTML-Seiten sowie `sitemap.xml`, `robots.txt` und `llms.txt`.

Hinweise:

- `robots.txt` wird nur im Domain-Root gelesen (`weekendcompiler.github.io/robots.txt`); die Sitemap daher direkt in der Google Search Console einreichen.
- GitHub Pages ignoriert `_headers`; dort gilt nur die `<meta>`-CSP.
- Sichtbarer FAQ-Text und `FAQPage`-JSON-LD in `faq.html` und `en/faq.html` müssen wortgleich bleiben.
- FAQ und Datenschutz gibt es pro Sprache als eigene Seite (Deutsch im Root, Englisch unter `en/`). Inhaltliche Änderungen immer in beiden Fassungen nachziehen; die Seiten verweisen per `hreflang` aufeinander, `data-href` trägt den relativen Pfad für die Weiterleitung in `boot.js`.
- Daten sind pro Origin gespeichert. Ein Umzug auf eine andere Domain startet für Nutzer leer; sie müssen vorher ein Backup exportieren.

## Icons und Vorschaubild

Alle Icon-Varianten (Favicon, Header, PWA, maskable, Apple-Touch) sind aus `assets/icons/newappicon.png` abgeleitet: rotes Motiv auf schwarzem Hintergrund. Beim maskable Icon muss das Motiv in der zentralen 80-%-Safe-Zone bleiben. Das Vorschaubild rendert man aus `tools/og-image.html` (1200×630, Headless Chrome). Farben folgen dem Icon-Rot; Text- und Primärfarben sind auf WCAG-AA-Kontrast geprüft.

## Checkliste vor dem Deploy

- über `http://localhost` testen (nicht `file://`), Konsole auf CSP-Fehler prüfen
- einmal im privaten Fenster durchspielen (gesperrter Speicher)
- beide Sprachen und beide Designs ansehen
- `VERSION` in `sw.js` erhöht?