# Render hosting

This project deploys as a static site. Use Node.js 24.15.0, build command
`npm ci --include=dev && npm run build:render`, and publish directory `.next-render`.
The repository's `render.yaml` contains the same settings.

The Render build uses Next.js static export and generates the offline asset
manifest, including the bundled PDF, fonts, PDF.js, and EPUB.js. There is no
server or database. Books opened by visitors stay on their own device.
Read-aloud uses the browser's installed voices and starts after a visitor action.

After deployment, load the library, open the included book, test narration,
and wait for the offline-ready message before disconnecting a kiosk.
Pushes to the connected `main` branch deploy automatically when Git integration
is enabled. Existing local presentation commands still use the separate `dist`
build. Generated files and dependencies are ignored by Git.
