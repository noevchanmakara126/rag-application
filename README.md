# RAG Playground

A small retrieval-augmented-generation app for testing: ingest documents, embed
them into **pgvector**, retrieve the relevant chunks, and stream a **cited**
answer from a self-hosted LLM.

Answers are built only from retrieved text. When nothing clears the similarity
floor the model is never called — the app says it does not know instead of
answering from the model's own memory.

| | |
|---|---|
| Frontend | Next.js 16 · React 19 · TypeScript · Tailwind v4 · shadcn/ui (`radix-nova`) · Motion · react-three-fiber |
| Backend | FastAPI · SQLAlchemy 2 (async) · Alembic · httpx |
| Vector store | Postgres 17 + pgvector, HNSW / `vector_cosine_ops` |
| Generation | Any **OpenAI-compatible** `/v1/chat/completions` (Ollama, vLLM, TGI, LM Studio) |
| Embeddings | Any **OpenAI-compatible** `/v1/embeddings` |
| Auth | None. Single-user by design |

---

## Quick start

Needs Docker, Python 3.11+, pnpm, and an OpenAI-compatible LLM + embedding
server. The defaults target Ollama on `localhost:11434`:

```bash
ollama pull qwen3:8b
ollama pull nomic-embed-text
```

### Everything in Docker

```bash
cp .env.example .env.development   # optional: make dev creates it for you
make dev                           # pgvector + backend + frontend, hot reload
```

### Local, with only Postgres in Docker

```bash
make setup      # venv + pip install -e ".[dev]", pnpm install, env files
make db         # pgvector/pgvector:pg17, waits until it accepts connections
make migrate    # creates the extension, tables and the HNSW index
make check      # confirms DB / LLM / embedding reachability and vector dim

# then, in two terminals
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000
cd frontend && pnpm dev
```

Open <http://localhost:3000>. Add something on **Documents**, then ask about it
on **Ask**. `make ingest-sample` seeds one document if you want to skip ahead.

---

## How it works

**Ingest** — three entry points converge on one pipeline:

```
 upload (PDF/TXT/MD) ─┐
 paste text ──────────┼─→ extract ─→ Document(status=pending) ─→ 201 returned
 URL (trafilatura) ───┘                      │
                                             ↓  BackgroundTask
                       chunk (1000 chars, 150 overlap)
                                             ↓
                       embed in batches  →  POST /v1/embeddings
                                             ↓
                       INSERT chunks (vector 768)  →  status=ready
```

The request returns before the vectors exist, because embedding a long PDF
takes far longer than an HTTP request should. The UI polls `status` and shows
`Queued → Embedding → Ready`, so a failure lands on the row as `Failed` with the
reason in a tooltip rather than vanishing.

**Query** — retrieval happens before a single token is generated:

```
 question ─→ embed query ─→ ORDER BY embedding <=> $1 LIMIT k   (HNSW index)
                                     ↓
                     drop anything below MIN_SCORE
                                     ↓
        ┌──── nothing left? ────→ "I could not find anything…"  (LLM not called)
        ↓
   number the passages [1..k], build the prompt
                                     ↓
   SSE:  {"sources":[…]}  →  {"delta":"…"} × N  →  {"done":true}
```

The `sources` frame is sent **first**, so the UI can paint citation chips while
the answer is still streaming. The model is told to cite with `[n]` markers that
index that same array; markers outside its range are rendered as literal text
rather than chips pointing at nothing.

---

## API

| Method | Path | |
|---|---|---|
| `GET` | `/health` | Liveness plus DB / LLM / embedding status and vector-dim match |
| `GET` | `/api/v1/documents` | List, newest first |
| `GET` | `/api/v1/documents/{id}` | Detail with chunk previews — the polling target |
| `POST` | `/api/v1/documents/upload` | `multipart/form-data`, PDF / TXT / MD |
| `POST` | `/api/v1/documents/text` | `{title, content}` |
| `POST` | `/api/v1/documents/url` | `{url}` |
| `DELETE` | `/api/v1/documents/{id}` | Cascades to chunks |
| `POST` | `/api/v1/search` | `{query, top_k?}` → scored chunks, **no LLM** |
| `POST` | `/api/v1/chat/stream` | `{content, history?, top_k?}` → SSE |

`/api/v1/search` exists so retrieval can be judged on its own: when an answer
looks wrong, it tells you whether the search or the model is at fault. It is
also how you re-calibrate `MIN_SCORE` after changing embedding model.

Interactive docs at <http://localhost:8000/docs> (disabled in production).

---

## Configuration

Everything lives in `.env.development` / `.env.production`, copied from
`.env.example`. The settings worth understanding:

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | `…@localhost:5433/rag` | Must be Postgres with pgvector. There is no SQLite fallback |
| `POSTGRES_PORT` | `5433` | Host mapping for the dev `db` container; off 5432 to avoid colliding with a local Postgres |
| `LLM_BASE_URL` | `http://localhost:11434/v1` | OpenAI-compatible base, including `/v1` |
| `LLM_MODEL` | `qwen3:8b` | |
| `LLM_API_KEY` | *(empty)* | Sent as Bearer only when set |
| `EMBEDDING_BASE_URL` | `http://localhost:11434/v1` | May differ from the LLM host |
| `EMBEDDING_MODEL` | `nomic-embed-text` | |
| `EMBEDDING_DIM` | `768` | **Must match the `vector(N)` column** |
| `EMBEDDING_DOCUMENT_PREFIX` | `search_document: ` | See below |
| `EMBEDDING_QUERY_PREFIX` | `search_query: ` | See below |
| `CHUNK_SIZE` / `CHUNK_OVERLAP` | `1000` / `150` | Characters |
| `TOP_K` | `5` | Passages retrieved per question |
| `MIN_SCORE` | `0.55` | Cosine-similarity floor |
| `MAX_UPLOAD_MB` | `20` | |

### The two settings that actually matter

**Embedding prefixes.** `nomic-embed-text`, `bge-*` and `e5-*` are trained for
asymmetric retrieval and expect a task prefix on each side. Omitting it does not
error — it quietly collapses the score range. Measured on this corpus without
prefixes, off-topic queries scored 0.35–0.51 and on-topic ones 0.48–0.64: no
threshold separates those. With prefixes the same queries score 0.42–0.54 and
0.66–0.84. For a model that does not want prefixes (e.g. `all-minilm`), set both
to `""`.

**`MIN_SCORE`.** Calibrated for the default model *with* those prefixes. Every
embedding model has its own scale, so after switching models, run a few on-topic
and off-topic queries through `POST /api/v1/search` and pick a floor between the
two clusters. Too high and good passages disappear; too low and every question
retrieves something.

**Changing `EMBEDDING_DIM`** means the `vector(N)` column no longer fits. Write
a migration, or for a test database just `make reset-db`. Changing either prefix
invalidates stored vectors without any error — re-ingest afterwards.

---

## Dev vs production

| | `make dev` | `make prod` |
|---|---|---|
| Postgres | `pgvector/pgvector:pg17` in-stack | Your own server via `DATABASE_URL` |
| Backend | `--reload`, source bind-mounted | 4 uvicorn workers, non-root, healthcheck |
| Frontend | `next dev` | `output: "standalone"` on `node:22-alpine` |
| `/docs` | On | Off |
| Migrations | Entrypoint runs `alembic upgrade head` | Same |

`docker-compose.prod.yml` has no `db` service: you said you would run pgvector
yourself. A commented-out one is at the bottom of the file if you change your
mind.

---

## Project layout

```
backend/app/
  api/v1/{documents,search,chat}.py   routes; chat.py is the SSE endpoint
  core/{config,deps}.py               pydantic-settings, Annotated DI aliases
  db/{base,session}.py                declarative base; asyncpg vector codec
  models/{document,chunk}.py          Chunk.embedding is Vector(EMBEDDING_DIM)
  services/
    llm.py          OpenAI-compatible streaming chat over httpx
    embeddings.py   batched /v1/embeddings, dimension guard
    chunking.py     recursive splitter with tail overlap
    extract.py      pypdf / trafilatura
    ingest.py       the BackgroundTask pipeline
    retrieval.py    cosine search + prompt construction
frontend/src/
  app/page.tsx                        the chat
  app/documents/page.tsx              ingest + library + retrieval tester
  app/api/chat/stream/route.ts        SSE passthrough, forwards the abort signal
  app/api/documents/upload/route.ts   multipart passthrough (see below)
  components/chat/                    chat-panel, message-bubble, source-card
  components/documents/               ingest-tabs, document-list, search-panel
  components/layout/                  shader + aurora backgrounds, header
  lib/{api,stream,citations}.ts       server-only client, SSE reader, [n] parser
```

Uploads go through a Route Handler rather than a Server Action on purpose:
Server Actions are capped by `serverActions.bodySizeLimit`, and a PDF routinely
exceeds any sensible value for it.

---

## Manual test pass

```bash
make check                                   # dim_matches must be true
make ingest-sample                           # then poll until status=ready

# retrieval alone — on-topic returns passages, off-topic returns none
curl -s -X POST localhost:8000/api/v1/search -H 'Content-Type: application/json' \
  -d '{"query":"why can HNSW be built on an empty table?"}'
curl -s -X POST localhost:8000/api/v1/search -H 'Content-Type: application/json' \
  -d '{"query":"recipe for banana bread"}'          # expect  "sources": []

# the stream: a sources frame must arrive before the first delta
curl -sN -X POST localhost:8000/api/v1/chat/stream -H 'Content-Type: application/json' \
  -d '{"content":"what operator does pgvector use for cosine distance?"}'

# stop the LLM and repeat: expect a clean {"error": …} frame, and /health still ok
make test                                    # pytest + ruff + tsc + eslint
```

In the browser: upload a PDF on **Documents** and watch `Embedding → Ready`
without reloading; ask a question on **Ask** and check that the `[n]` chips open
the right passage and that **Stop** aborts mid-stream. With OS reduced-motion
enabled the background shader renders one frame instead of animating.

---

## Not built (deliberately)

- **Auth and per-user scoping.** Single-user; every document is global.
- **Conversation persistence.** The client replays history each request, so a
  reload starts a fresh chat. No `Conversation`/`Message` tables exist.
- **Reranking** (cross-encoder) and **hybrid BM25 + vector** search. The plain
  cosine top-k plus a calibrated floor is enough to test with.
- **Full markdown rendering.** Inline code is handled because models emit it
  constantly; everything else renders as plain text.
- **OCR.** A scanned PDF has no extractable text and is rejected with that
  reason rather than ingested empty.
