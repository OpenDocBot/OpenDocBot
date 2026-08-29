# Contributing to OpenDocBot

Thanks for your interest in contributing! OpenDocBot is an open-source add-in that lets you connect any AI provider to Microsoft Word, Excel and PowerPoint.

## Development Setup

```bash
git clone https://github.com/opendocbot/opendocbot.git
cd opendocbot
npm install
npm run dev         # starts on https://localhost:3000
```

### Loading the add-in in Word

1. Open Word (desktop or online)
2. Insert → Add-ins → Upload My Add-in → `manifest.xml`
3. The add-in appears in the right sidebar

### Proxy in dev

The dev server exposes a same-origin `/proxy/<encoded-baseUrl>/<path>` route
(`scripts/proxy.mjs`). To test a provider without browser CORS, open Settings →
Advanced → **Proxy API requests through this server**. The checkbox is visible in
dev builds and in `VITE_PROXY_ENABLED=true` production builds (Docker /
`make serve`). The **OpenCode Go preset forces it on** and is only listed when the
proxy is available. The `/models` fetch respects the proxy setting too.

### Running tests

```bash
npm test -- --run                          # All tests
npm test -- --run src/__tests__/chat/      # Specific directory
```

For integration tests against real providers:
```bash
OPENCODE_API_KEY=sk-... OPENAI_API_KEY=... GEMINI_API_KEY=... ANTHROPIC_API_KEY=... \
  npm test -- --run src/__tests__/providers/integration.test.ts
```

Each provider's suite is skipped when its key is not set. In CI, the keys come
from GitHub secrets. Deploys to Cloudflare are gated on these tests: the
`deploy` job in `.github/workflows/ci.yml` only runs after the `test` job passes
and deploys the built `dist/` to the Cloudflare Workers project `opendocbot`
via `wrangler deploy` (no git connection).

### Code quality

```bash
npm run typecheck    # TypeScript
npm run lint         # ESLint
```

CI runs all three on every push to `main`.

## License

By submitting a contribution, you agree to the
[Contributor License Agreement](CONTRIBUTOR_LICENSE_AGREEMENT). The project is
licensed under the [OpenDocBot License](LICENSE).

## Release Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm test -- --run` passes
- [ ] Manual test in Word (desktop or online)
- [ ] Update `manifest.xml` version
- [ ] Tag release

## Questions?

Open an issue or start a discussion. We're happy to help.
