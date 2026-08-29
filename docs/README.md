# OpenDocBot docs

This is the documentation site for **OpenDocBot**, built with [VitePress](https://vitepress.dev). 

## Local development

```bash
npm install
npm run docs:dev      # http://localhost:5173
```

## Build

```bash
npm run docs:build    # static output in docs/.vitepress/dist
npm run docs:preview  # serve the built site locally
```

## Writing docs

All content is plain markdown in `docs/`:

| File | Purpose |
|---|---|
| `index.md` | Landing page (home layout) |
| `docs/quickstart.md` | Setup: hosted instance, sideload, self-host/dev |
| `docs/compatibility.md` | Office hosts, versions, provider feature matrix, CORS |
| `docs/configuration.md` | Settings, presets, advanced options, proxy |
| `docs/providers.md` | Per-provider setup guides |
| `docs/selfhosting.md` | Docker / Node / static hosting, proxy, manifest |
| `docs/features.md` | HITL, caching, reasoning, questions, etc. |
| `docs/troubleshooting.md` | Common problems and fixes |

Sidebar and nav live in `.vitepress/config.mts`; the terminal/hacky visual theme is in `.vitepress/theme/custom.css`.

> When editing, keep code examples accurate; the add-in's behavior is the
> source of truth, not the prose.
