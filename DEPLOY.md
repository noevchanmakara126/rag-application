# Server checklist

What has to exist on the server before `make prod` will work, and the order to
do it in. Everything below assumes you are deploying this repo as-is.

---

## 1. What you must install

|                                           | Why                                                              | Check it works                 |
| ----------------------------------------- | ---------------------------------------------------------------- | ------------------------------ |
| **Docker + Compose v2**                   | Both services are containers                                     | `docker compose version`       |
| **Postgres 17 with pgvector**             | The vector store. **Not optional** — there is no SQLite fallback | `psql -c '\dx'` lists `vector` |
| **An OpenAI-compatible LLM server**       | `/v1/chat/completions` with streaming                            | `curl $LLM_BASE_URL/models`    |
| **An OpenAI-compatible embedding server** | `/v1/embeddings`                                                 | see §4                         |
| **git**                                   | To clone this repo                                               |                                |

The LLM and embedding servers may be the same process (Ollama serves both) or
two different hosts — they are configured independently.

### pgvector

The extension must be _installed_ on the server; the app creates it in the
database itself during migration. On Debian/Ubuntu with PGDG:

```bash
sudo apt install postgresql-17-pgvector
```

Then create the role and database:

```sql
CREATE ROLE rag LOGIN PASSWORD 'a-real-password';
CREATE DATABASE rag OWNER rag;
```

The first migration runs `CREATE EXTENSION IF NOT EXISTS vector`, which needs
superuser **or** a role with `CREATE` on the database. If your `rag` role cannot
create extensions, run this once as a superuser first:

```sql
\c rag
CREATE EXTENSION vector;
```

### Models

If you are using Ollama, pull both before starting the app:

```bash
ollama pull qwen3:8b            # generation
ollama pull nomic-embed-text    # embeddings, 768-dim
```

---

## 2. Network and ports

| Port                  | Who opens it       | Notes                                                                                                |
| --------------------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `3000`                | frontend container | The only one a browser needs. Put a reverse proxy in front for TLS                                   |
| `8000`                | backend container  | Should **not** be public — the frontend reaches it over the compose network as `http://backend:8000` |
| `5432`                | your Postgres      | Must be reachable _from the backend container_                                                       |
| LLM / embedding ports | your model servers | Must be reachable _from the backend container_                                                       |

Three things that bite here:

- **`localhost` inside a container is the container.** If Postgres or Ollama runs
  on the host, use `host.docker.internal` (the prod compose already maps it) or
  the host's LAN IP — never `localhost`.
- **If you reverse-proxy with nginx, disable buffering** on the chat route or
  the answer arrives all at once instead of streaming. The backend already sends
  `X-Accel-Buffering: no`, but confirm `proxy_buffering off;` is not being
  overridden.
- **Uploads default to a 20 MB cap** (`MAX_UPLOAD_MB`). Raise nginx's
  `client_max_body_size` to match or larger files fail at the proxy.

---

## 3. Configuration

```bash
git clone <this repo> && cd rag-deploy
cp .env.example .env.production
$EDITOR .env.production
```

Compose **refuses to start** until these three are set — there is no default,
on purpose, because a wrong one fails in a confusing way later:

| Variable             | Example                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`       | `postgresql+asyncpg://rag:PASSWORD@host.docker.internal:5432/rag` |
| `LLM_BASE_URL`       | `http://host.docker.internal:11434/v1`                            |
| `EMBEDDING_BASE_URL` | `http://host.docker.internal:11434/v1`                            |
| `CORS_ORIGINS`       | `https://rag.example.com`                                         |

Note the driver prefix: `postgresql+asyncpg://`, not plain `postgresql://`.
And `*_BASE_URL` must include the `/v1` suffix.

Everything else has a working default. The ones you are most likely to touch:

| Variable                         | Default             |                                                      |
| -------------------------------- | ------------------- | ---------------------------------------------------- |
| `LLM_MODEL`                      | `qwen3:8b`          | Default only — switchable in the UI, see §4           |
| `EMBEDDING_MODEL`                | `nomic-embed-text`  |                                                      |
| `EMBEDDING_DIM`                  | `768`               | **Must match the model's real output size** — see §4 |
| `EMBEDDING_DOCUMENT_PREFIX`      | `search_document: ` | See §5                                               |
| `EMBEDDING_QUERY_PREFIX`         | `search_query: `    | See §5                                               |
| `MIN_SCORE`                      | `0.55`              | Calibrated for the default model — see §5            |
| `TOP_K`                          | `5`                 | Passages per question                                |
| `MAX_UPLOAD_MB`                  | `20`                |                                                      |
| `FRONTEND_PORT` / `BACKEND_PORT` | `3000` / `8000`     | Host mappings                                        |
| `LLM_API_KEY`                    | _(empty)_           | Only if your server demands a bearer token           |

`docker-compose.prod.yml` only forwards the variables it names. If you add a new
setting to `.env.production` and nothing changes, check that it is listed in the
`backend.environment:` block.

---

## 4. Bring it up

```bash
make prod        # builds both images, runs migrations, starts the stack
```

The backend entrypoint runs `alembic upgrade head` before the server starts, so
the schema is created on first boot. Nothing to run by hand.

Then verify, in this order — each step rules out the layer below it:

```bash
curl -s http://SERVER:8000/health | python3 -m json.tool
```

You are looking for **all four** of these:

```jsonc
"database":  { "reachable": true },
"llm":       { "reachable": true },
"embedding": { "reachable": true,
               "dim_matches": true }     // ← the one people miss
```

`dim_matches: false` means your embedding model does not produce
`EMBEDDING_DIM` values. Fix it **now** — it otherwise surfaces later as an
opaque insert error on the first document. Set `EMBEDDING_DIM` to the reported
`dim` and recreate the schema (§6), since the `vector(N)` column size is fixed
at migration time. Common sizes: `nomic-embed-text` 768, `mxbai-embed-large`
1024, `all-minilm` 384, `bge-m3` 1024.

Then a real round trip:

```bash
# index one document
curl -s -X POST http://SERVER:8000/api/v1/documents/text \
  -H 'Content-Type: application/json' \
  -d '{"title":"smoke test","content":"The deploy check phrase is pineapple-42."}'

# poll until status is "ready" with chunk_count > 0
curl -s http://SERVER:8000/api/v1/documents

# retrieval only — no model involved
curl -s -X POST http://SERVER:8000/api/v1/search \
  -H 'Content-Type: application/json' -d '{"query":"what is the deploy check phrase?"}'

# the full stream: a "sources" frame must arrive before the first "delta"
curl -sN -X POST http://SERVER:8000/api/v1/chat/stream \
  -H 'Content-Type: application/json' -d '{"content":"what is the deploy check phrase?"}'
```

Check which models the picker will offer — this is the LLM server's own
`/v1/models` list, minus `EMBEDDING_MODEL`:

```bash
curl -s http://SERVER:8000/api/v1/chat/models | python3 -m json.tool
# {"models": ["llama3.2:3b", "qwen3:8b"], "default": "qwen3:8b"}
```

`LLM_MODEL` is only the entry the chat starts on; the picker next to *Passages
retrieved* switches model per question. A server that is down, or one without a
`/models` route, still leaves `LLM_MODEL` selectable — so an empty-looking list
here means the LLM server, not the app. `ollama pull` a model and it appears on
the next page load, with no redeploy.

Finally open `https://your-domain` and ask the same question in the UI.

---

## 5. Calibrate before you trust the answers

**This is the step most likely to be skipped and most likely to matter.**

If you kept `nomic-embed-text`, the shipped defaults are already calibrated and
you can move on. **If you switched embedding model, do both of these:**

**a. Check whether your model wants task prefixes.** `nomic-embed-text`, `bge-*`
and `e5-*` are trained for asymmetric retrieval and expect them. Models like
`all-minilm` do not — for those set both prefixes to empty:

```
EMBEDDING_DOCUMENT_PREFIX=
EMBEDDING_QUERY_PREFIX=
```

Getting this wrong never raises an error. It quietly compresses the similarity
range so that no threshold can separate relevant from irrelevant.

**b. Re-measure `MIN_SCORE`.** Every embedding model has its own scale. Index a
few representative documents, then run several questions through
`POST /api/v1/search` — some the corpus can answer, some it cannot — and look at
the top score of each. Set `MIN_SCORE` between the two clusters.

For reference, measured on this repo's test corpus with `nomic-embed-text`:

|                  | off-topic top score | on-topic top score                  |
| ---------------- | ------------------- | ----------------------------------- |
| without prefixes | 0.35 – 0.51         | 0.48 – 0.64 (unusable, overlapping) |
| with prefixes    | 0.42 – 0.54         | 0.66 – 0.84 → floor of **0.55**     |

Too high and good passages vanish. Too low and every question retrieves
something, which defeats the point — the app answers "I don't know" precisely
when nothing clears this floor.

Changing either prefix invalidates every vector already stored, without any
error. Re-ingest your documents afterwards.

---

## 6. Operating it

```bash
make logs-prod                        # tail both services
make down-prod                        # stop
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build backend
```

**Deploying a change:** `git pull && make prod`. Migrations run on boot.

**Changing `EMBEDDING_DIM`** means the `vector(N)` column no longer fits. On a
throwaway database, drop and recreate:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm backend \
  alembic downgrade base
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm backend \
  alembic upgrade head
```

On a database you care about, write a real migration instead — and remember you
must re-embed everything regardless, since vectors from a different model are
not comparable.

**Backups:** everything the app owns lives in the `documents` and `chunks`
tables. A normal `pg_dump` of the `rag` database is a complete backup. Chunks
are reproducible from the source documents, so if the dump size bothers you,
dumping `documents` alone plus re-ingesting is also valid.

---

## 7. Before you expose it publicly

This was built as a testing app. Two things are worth knowing before it faces
anything beyond you:

- **There is no authentication.** Anyone who can reach the frontend can read
  every indexed document, add documents, and delete them. Put it behind your
  own auth layer (reverse-proxy basic auth, an SSO proxy, or a private network)
  before it is reachable from the internet.
- **URL ingestion fetches any URL the caller supplies**, from inside your
  network. On an untrusted-input deployment that is a server-side request
  forgery vector — restrict it, or disable the `/api/v1/documents/url` route.

Also absent by design: rate limiting, per-user document scoping, and an upload
virus scan. See the "Not built (deliberately)" section of `README.md`.

---

## Quick reference

```bash
# on the server, from scratch
git clone <repo> && cd rag-deploy
cp .env.example .env.production && $EDITOR .env.production   # 4 required vars
make prod
curl -s localhost:8000/health | python3 -m json.tool          # 4 green checks
# then §4 smoke test, and §5 if you changed embedding model
```
