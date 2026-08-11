# Digital Signage – GitHub Pages Version

Diese Version ist für **reines GitHub Pages Hosting** optimiert.

GitHub Pages selbst ist statisches Hosting. Es kann daher fremde RSS-Feeds nicht serverseitig proxien. Die App versucht deshalb:

1. RSS direkt im Browser
2. bei CORS-Fehlern automatisch einen RSS-Fallback
3. wenn auch der Fallback nicht erreichbar ist, bleiben die zuletzt erfolgreich geladenen Inhalte sichtbar

Es gibt **kein Proxy-Feld und keine zusätzliche Konfiguration**.

## Deployment

Alle drei Dateien in das GitHub-Pages-Repository legen:

- `index.html`
- `styles.css`
- `app.js`

Danach GitHub Pages aktivieren.

## Hinweis

Der automatische Fallback verwendet externe öffentliche Infrastruktur. Das ist die einzige Möglichkeit, einen CORS-gesperrten Feed aus einer ausschließlich statischen GitHub-Pages-App heraus anzufragen. Für maximale Zuverlässigkeit und Kontrolle wäre ein eigener Server/Worker besser.

Instagram bleibt bewusst ohne Fake-Daten. Dafür wird später ein offizieller API-/Backend-Adapter benötigt.
