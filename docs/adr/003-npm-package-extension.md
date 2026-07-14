# Pi extension as npm package

The extension will be an npm package with `pi.extensions` in package.json. Users install with `npm install pi-web-sync` and the extension auto-discovers.

Context: The extension needs to be distributable and easy to install. Pi supports npm packages via the `packages` field in settings.json, and extensions can be auto-discovered from `~/.pi/agent/extensions/`. Publishing as npm is the standard distribution channel.

Decision: Structure as an npm package with the entry point declared under `pi.extensions`. The package includes TypeScript source (no build step — pi uses jiti for runtime transpilation).

Why: Standard npm distribution, no build step required, auto-discovery works out of the box.