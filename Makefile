.PHONY: run build test lint verify docs docs-build docs-preview serve docker-up docker-down docker-build docker-run docker-logs clean

run:
	npm run dev

build:
	npm run build

test:
	npm run test:run

lint:
	npm run lint

docs:
	npm run docs:dev

docs-build:
	npm run docs:build

docs-preview:
	npm run docs:preview

# Self-hosted server: build with the proxy enabled, then serve dist/ + /proxy/.
# Load .env when present so the Node path behaves like the documented setup.
serve:
	VITE_PROXY_ENABLED=true npm run build
	@if [ -f .env ]; then \
		node --env-file=.env scripts/serve.mjs; \
	else \
		node scripts/serve.mjs; \
	fi

# Docker for self-hosted deployments (includes the /proxy/ route).
# Run ./setup.sh first to create certs/ and .env. Compose builds the image,
# serves it over HTTPS on OPENDOCBOT_HTTPS_PORT (default 443), and restarts it
# automatically.
docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

# Thin aliases kept for backward compatibility.
docker-build:
	docker compose build

docker-run:
	docker compose up -d --build

docker-logs:
	docker compose logs -f

verify: build test lint
	@echo "✅ All verifications passed"

clean:
	rm -rf dist node_modules
