# Digital Signage – GitHub Pages V3

- RSS/Atom parser mit Namespace-Unterstützung
- Bilder aus `media:content`, `media:thumbnail`, `enclosure` und `<img>` in Beschreibungen
- relative Bild-URLs werden aufgelöst
- fehlende Bilder lösen zusätzlich einen OpenGraph/Twitter-Image-Versuch aus
- bei fehlendem Bild bekommt die Karte deutlich mehr Platz für Text
- Feed-Fehler bleiben auf die jeweilige Quelle begrenzt
- zuletzt erfolgreiche Inhalte bleiben sichtbar
- Instagram nutzt einen öffentlichen Drittanbieter-Adapter (Prexzy), der laut dessen Dokumentation ohne API-Key und ohne Anmeldung nutzbar ist
- keine erfundenen Instagram-Posts

Hinweis: Instagram selbst stellt keinen offiziellen loginfreien Feed beliebiger öffentlicher Profile für eine reine GitHub-Pages-App bereit. Der Drittanbieter-Adapter ist daher eine externe Abhängigkeit und kann bei Änderungen von Instagram ausfallen.
