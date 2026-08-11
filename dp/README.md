# Digital Signage Web-App

Eine browserbasierte 9:16-Digital-Signage-App mit:

- RSS-Quellen
- Speicherung in `localStorage`
- 3 neuesten Artikeln pro RSS-Feed
- Bild-Erkennung über `media:content`, `media:thumbnail`, `enclosure` und `<img>` in der Beschreibung
- automatischer Slide-Wechsel
- automatischer Aktualisierung
- Admin-Bereich
- 9:16-Live-Vorschau
- Fehlerisolierung pro Quelle
- vorbereitetem Adapter für Instagram

## Start

Einfach `index.html` in einem modernen Browser öffnen.

Für zuverlässiges Laden von RSS-Feeds empfiehlt sich ein lokaler/statischer Webserver, z.B.:

```bash
python3 -m http.server 8080
```

Danach `http://localhost:8080` öffnen.

## Wichtige Browser-Einschränkung

Viele RSS-Server erlauben keine Cross-Origin-Requests (CORS). Eine reine Frontend-App kann diese Sperre nicht umgehen. Deshalb enthält die App eine optionale Proxy-Konfiguration unter **Einstellungen → CORS-Proxy**.

Der Proxy sollte sinngemäß:

`GET /<encoded-target-url>`

an die Ziel-URL weiterleiten und die RSS/XML-Antwort mit passenden CORS-Headern zurückgeben.

Für einen produktiven Einsatz sollte ein eigener kleiner Backend-/Proxy-Service verwendet werden.

## Instagram

Direktes Scraping öffentlicher Instagram-Profile aus dem Browser ist nicht zuverlässig und verstößt je nach Zugriffsmethode gegen technische/API-Beschränkungen. Die App zeigt deshalb keine erfundenen Inhalte.

Die Datenquelle ist bereits getrennt und kann später über einen Backend-Adapter angebunden werden, idealerweise über die offizielle Instagram/Meta API. Die erwartete Normalform der Daten ist:

```js
{
  id,
  type: "instagram",
  source,
  title,
  text,
  image,
  date,
  link
}
```

## Architektur

- `app.js` – UI, State und Orchestrierung
- `loadRSS()` / `parseRSS()` – RSS-Datenabruf und Normalisierung
- `loadInstagram()` – Instagram-Adapter-Grenze
- `localStorage` – persistente Browser-Speicherung
- Display – getrennt von Admin-Ansicht
- Fehler werden pro Quelle gespeichert und blockieren andere Quellen nicht

## Erweiterung auf Backend

Die Frontend-Adapter können später durch API-Aufrufe ersetzt werden. Empfehlenswert ist ein Backend mit Endpunkten wie:

- `GET /api/sources`
- `POST /api/sources`
- `DELETE /api/sources/:id`
- `GET /api/content`
- `POST /api/refresh`

Die Display-Komponente sollte weiterhin nur normalisierte Content-Objekte konsumieren.
