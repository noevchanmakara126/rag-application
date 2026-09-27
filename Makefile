.PHONY: help setup dev dev-local db prod down down-prod migrate revision reset-db check ingest-sample test lint logs logs-prod clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

setup: .env.development ## First-time local setup (no Docker)
	cd backend && python3 -m venv .venv && .venv/bin/pip install -q -U pip && .venv/bin/pip install -q -e ".[dev]" && cp -n ../.env.example .env || true
	cd frontend && pnpm install && cp -n .env.example .env.local || true
	@echo "✓ setup done — run 'make db', 'make migrate', then 'make dev-local'"

.env.development:
	cp .env.example .env.development
	@echo "→ created .env.development from the template"

db: .env.development ## Start only Postgres+pgvector (for local, non-Docker dev)
	docker compose -f docker-compose.dev.yml --env-file .env.development up -d db
	@echo "→ waiting for pgvector to accept connections..."
	@until docker compose -f docker-compose.dev.yml exec -T db pg_isready -q 2>/dev/null; do sleep 1; done
	@echo "✓ pgvector ready"

dev: .env.development ## Start the full dev stack (hot reload, pgvector in-stack)
	docker compose -f docker-compose.dev.yml --env-file .env.development up --build

dev-local: ## Run both services locally without Docker (needs 2 terminals)
	@echo "Terminal 1: cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000"
	@echo "Terminal 2: cd frontend && pnpm dev"

prod: ## Start the production stack (your own pgvector via DATABASE_URL)
	@test -f .env.production || { \
		echo "✗ .env.production is missing. Run: cp .env.example .env.production"; \
		echo "  then point DATABASE_URL at your pgvector server and set the LLM URLs."; \
		exit 1; }
	docker compose -f docker-compose.prod.yml --env-file .env.production up --build -d
	@echo "→ up. Frontend: http://localhost:$${FRONTEND_PORT:-3000}"

down: ## Stop the dev stack
	docker compose -f docker-compose.dev.yml down

down-prod: ## Stop the production stack
	docker compose -f docker-compose.prod.yml down

migrate: ## Apply DB migrations (local venv)
	cd backend && .venv/bin/alembic upgrade head

revision: ## Autogenerate a migration: make revision m="add x"
	cd backend && .venv/bin/alembic revision --autogenerate -m "$(m)"

reset-db: ## Drop the dev database volume and re-migrate (use after changing EMBEDDING_DIM)
	docker compose -f docker-compose.dev.yml down -v
	$(MAKE) db
	$(MAKE) migrate
	@echo "✓ schema recreated at the current EMBEDDING_DIM"

check: ## Report backend, DB, LLM and embedding reachability
	@curl -fsS http://localhost:8000/health | python3 -m json.tool || \
		echo "✗ backend not reachable on :8000"

ingest-sample: ## Index a small sample document so there is something to query
	@curl -fsS -X POST http://localhost:8000/api/v1/documents/text \
		-H 'Content-Type: application/json' \
		-d '{"title":"pgvector sample notes","content":"pgvector is a Postgres extension that stores embedding vectors and searches them by distance. It supports three index types. IVFFlat partitions vectors into lists and must be built against existing rows, because it trains those lists from the data. HNSW builds a navigable small-world graph instead and can be created on an empty table. Cosine distance is written with the <=> operator. This project uses HNSW with vector_cosine_ops, and keeps the similarity floor at 0.25 so unrelated questions return no passages at all."}' \
		| python3 -m json.tool
	@echo "→ poll: curl -s localhost:8000/api/v1/documents | python3 -m json.tool"

test: ## Run backend tests and frontend type/lint checks
	cd backend && .venv/bin/python -m pytest tests -q && .venv/bin/ruff check .
	cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src --max-warnings=0

lint: ## Lint only
	cd backend && .venv/bin/ruff check .
	cd frontend && pnpm exec eslint src --max-warnings=0

logs: ## Tail dev logs
	docker compose -f docker-compose.dev.yml logs -f

logs-prod: ## Tail production logs
	docker compose -f docker-compose.prod.yml logs -f

clean: ## Remove build artifacts and caches
	rm -rf frontend/.next backend/.pytest_cache backend/.ruff_cache
	find backend -name __pycache__ -type d -prune -exec rm -rf {} +
