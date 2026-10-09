# ShoeTracker

Kilometerzähler für Laufschuhe als installierbare PWA: offline nutzbar, ohne Konto, ohne Server, ohne Tracking. Alle Daten bleiben auf dem Gerät.

**Live:** https://weekendcompiler.github.io/ShoeTracker/

## Funktionen

- Schuhe anlegen (Modell, Marke, Emoji, Kaufdatum, Preis, Startkilometer, Verschleißgrenze)
- Läufe mit Distanz, Datum und Notiz eintragen
- Verschleißstatus je Schuh: unter 75 % „Gut“, ab 75 % „Demnächst fällig“, ab 90 % „Verschlissen“
- Sortieren per Drag & Drop oder Pfeiltasten, archivieren, löschen (mit Rückgängig)
- Statistik, CSV-Export, JSON-Backup und Wiederherstellung
- Deutsch und Englisch (automatisch nach Systemsprache, umschaltbar), helles und dunkles Design
- Kilometer oder Meilen sowie Währung wählbar (EUR, USD, CHF, GBP, JPY, SEK, NOK, DKK) – gespeichert wird intern immer in km
- Alle Einstellungen (Sprache, Distanz, Währung, Design) zentral hinter dem Zahnrad oben rechts
- Offline-Betrieb und automatische Updates per Service Worker

## Schnellstart

Keine Abhängigkeiten, kein Build. Ein lokaler HTTP-Server reicht (unter `file://` fehlen Service Worker und Installierbarkeit):

```bash
python3 -m http.server 8000
# http://localhost:8000/
```

## Projektstruktur

```
index.html              App (Markup, Icon-Sprite, JSON-LD)
faq.html                FAQ (+ FAQPage-JSON-LD)
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
_headers                Security-Header (nur Netlify/Cloudflare Pages, nicht GitHub Pages)
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
