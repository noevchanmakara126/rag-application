# Production deploy — command runbook

Every command needed to take this repo from a bare Ubuntu server to a working
deployment, in order, with nothing implied.

This runbook targets **plain HTTP on a server IP** — the shortest path to a
working app. Adding a domain and TLS later is Appendix A and changes two
variables.

`DEPLOY.md` is the *why* — what each variable means, how to calibrate retrieval,
what is deliberately missing. This file is the *what to type*.

Substitute throughout:

| Placeholder       | Meaning                                       |
| ----------------- | --------------------------------------------- |
| `SERVER_IP`       | the address you will type into a browser      |
| `STRONG_PASSWORD` | a real Postgres password you generate         |

Find `SERVER_IP` with `hostname -I | awk '{print $1}'`.

---

## 0. The whole thing, in one block

If you already understand the stack, this is the entire deploy. Every step is
expanded and explained in the sections below.

```bash
# ── host packages ───────────────────────────────────────────────────────
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && newgrp docker
curl -fsSL https://ollama.com/install.sh | sh

# ── make Ollama reachable from inside containers ─────────────────────────
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf >/dev/null <<'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
EOF
sudo systemctl daemon-reload && sudo systemctl restart ollama
ollama pull qwen3:8b
ollama pull nomic-embed-text

# ── pgvector ─────────────────────────────────────────────────────────────
docker run -d --name pgvector --restart unless-stopped \
  -e POSTGRES_PASSWORD=STRONG_PASSWORD \
  -p 5432:5432 -v pgdata:/var/lib/postgresql/data \
  pgvector/pgvector:pg17
sleep 10
docker exec pgvector psql -U postgres -c "CREATE ROLE rag LOGIN PASSWORD 'STRONG_PASSWORD';"
docker exec pgvector psql -U postgres -c "CREATE DATABASE rag OWNER rag;"
docker exec pgvector psql -U postgres -d rag -c "CREATE EXTENSION IF NOT EXISTS vector;"

# ── the app ──────────────────────────────────────────────────────────────
git clone <your-repo-url> rag-deploy && cd rag-deploy
cp .env.example .env.production
$EDITOR .env.production          # see §3
make prod

# ── verify ───────────────────────────────────────────────────────────────
curl -s localhost:8000/health | python3 -m json.tool
curl -s localhost:8000/api/v1/chat/models | python3 -m json.tool

# ── open the port and browse to it ───────────────────────────────────────
sudo ufw allow OpenSSH && sudo ufw allow 3000/tcp && sudo ufw enable
echo "open http://$(hostname -I | awk '{print $1}'):3000"
```

Copy-pasteable in order, top to bottom. No reverse proxy needed — the frontend
serves on `3000` and talks to the backend over the compose network.

---

## 1. Host packages

### Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker                      # or log out and back in
docker compose version             # must print v2.x
```

### Ollama, or any OpenAI-compatible server

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Then make it reachable from inside a container.** This is the single most
common reason a deploy comes up and cannot generate: Ollama binds `127.0.0.1` by
default, which the backend container cannot reach even through
`host.docker.internal`.

```bash
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf >/dev/null <<'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
EOF
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

Confirm it is listening on all interfaces, not just loopback:

```bash
ss -lntp | grep 11434        # want 0.0.0.0:11434, not 127.0.0.1:11434
```

Pull both models — generation and embeddings:

```bash
ollama pull qwen3:8b
ollama pull nomic-embed-text
ollama list
```

If `ufw` is active, allow the Docker bridge to reach the host's Ollama port.
This exposes `11434` to containers only, not to the internet:

```bash
sudo ufw allow in on docker0 to any port 11434 proto tcp
```

---

## 2. pgvector

Skip to the role/database commands if the container is already running.

```bash
docker run -d --name pgvector --restart unless-stopped \
  -e POSTGRES_PASSWORD=STRONG_PASSWORD \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  pgvector/pgvector:pg17
```

`-v pgdata:...` is not optional unless you are willing to lose every indexed
document to a `docker rm`.

Create the role, the database, and the extension. Doing the extension here as
superuser avoids the failure where the `rag` role lacks the right to create it
during the first migration:

```bash
docker exec pgvector psql -U postgres -c \
  "CREATE ROLE rag LOGIN PASSWORD 'STRONG_PASSWORD';"
docker exec pgvector psql -U postgres -c \
  "CREATE DATABASE rag OWNER rag;"
docker exec pgvector psql -U postgres -d rag -c \
  "CREATE EXTENSION IF NOT EXISTS vector;"
```

Verify — `vector` must appear in the extension list:

```bash
docker exec pgvector psql -U postgres -d rag -c '\dx'
```

> If you created the container with a `POSTGRES_USER` other than the default,
> replace `-U postgres` with that name.

---

## 3. Configure

```bash
git clone <your-repo-url> rag-deploy
cd rag-deploy
cp .env.example .env.production
```

Edit `.env.production`. Compose **refuses to start** without the first four:

```ini
# Note the driver prefix, and host.docker.internal — NOT localhost, which
# inside a container means the container itself.
DATABASE_URL=postgresql+asyncpg://rag:STRONG_PASSWORD@host.docker.internal:5432/rag

LLM_BASE_URL=http://host.docker.internal:11434/v1
EMBEDDING_BASE_URL=http://host.docker.internal:11434/v1

# The exact browser-facing origin: scheme, host and port, no trailing slash.
CORS_ORIGINS=http://SERVER_IP:3000

# Used for absolute links in the frontend.
NEXT_PUBLIC_APP_URL=http://SERVER_IP:3000

# Keeps the API off the public internet. The frontend does not use this port —
# it reaches the backend as http://backend:8000 over the compose network — so
# binding it to loopback only costs you nothing but lets you still curl it
# from the server itself.
BACKEND_PORT=127.0.0.1:8000
```

Leave everything else at its default unless you changed embedding model — in
which case read `DEPLOY.md` §5 before trusting any answer, because a wrong
`MIN_SCORE` or a missing task prefix degrades retrieval silently.

`LLM_MODEL` is only the model the chat **starts** on. The picker in the UI offers
everything the server reports at `/v1/models`, so `ollama pull` a new model and
it appears on the next page load with no redeploy.

The two values people get wrong here, every time:

- **`DATABASE_URL` must not say `localhost`.** Inside a container that means the
  container itself, and you get
  `Connect call failed ('127.0.0.1', 5432)`. Use `host.docker.internal`, which
  the prod compose already maps to the host gateway.
- **The port must match what your Postgres actually publishes.** The template
  ships `5433`, which is the *development* mapping chosen to dodge a Postgres
  already installed on a laptop. A standard pgvector container publishes `5432`.

Two properties of `.env.production` worth internalising:

- `docker-compose.prod.yml` only forwards the variables it **names**. Adding a
  setting that is not in the `backend.environment:` block has no effect.
- The file holds your database password. `chmod 600 .env.production`.

---

## 4. Bring it up

```bash
make prod
```

That is `docker compose -f docker-compose.prod.yml --env-file .env.production
up --build -d`. The backend entrypoint runs `alembic upgrade head` before
uvicorn starts, so the schema is created on first boot — there is no migration
step to run by hand.

Watch it start:

```bash
make logs-prod
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

Both services should read `Up`. `backend` also carries a healthcheck, so it
reports `(healthy)` within about 30s.

---

## 5. Verify, in this order

Each step rules out the layer below it. Do not skip to the UI.

### a. Dependencies

```bash
curl -s localhost:8000/health | python3 -m json.tool
```

Four things must be true:

```jsonc
"database":  { "reachable": true },
"llm":       { "reachable": true },
"embedding": { "reachable": true,
               "dim_matches": true }     // ← the one people miss
```

`dim_matches: false` means `EMBEDDING_DIM` does not match what your embedding
model actually returns. **Fix it now** — it otherwise surfaces much later as an
opaque insert error on your first document. The `vector(N)` column size is fixed
at migration time, so correcting it means recreating the schema (§7).

If `llm.reachable` is false, the container cannot see Ollama. Ask from inside
the container, where the answer is unambiguous:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec backend curl -fsS http://host.docker.internal:11434/v1/models
```

### b. The model list the UI will offer

```bash
curl -s localhost:8000/api/v1/chat/models | python3 -m json.tool
# {"models": ["llama3.2:3b", "qwen3:8b"], "default": "qwen3:8b"}
# EMBEDDING_MODEL is filtered out — it cannot answer a chat request.
```

This endpoint never fails. If it returns only your `LLM_MODEL`, the LLM server
could not be asked — that is an Ollama problem, not an app problem.

### c. A real round trip

```bash
# index one document
curl -s -X POST localhost:8000/api/v1/documents/text \
  -H 'Content-Type: application/json' \
  -d '{"title":"smoke test","content":"The deploy check phrase is pineapple-42."}'

# poll until status is "ready" with chunk_count > 0
curl -s localhost:8000/api/v1/documents | python3 -m json.tool

# retrieval only — no model involved
curl -s -X POST localhost:8000/api/v1/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"what is the deploy check phrase?"}' | python3 -m json.tool

# the full stream: a "sources" frame must arrive before the first "delta"
curl -sN -X POST localhost:8000/api/v1/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"content":"what is the deploy check phrase?"}'
```

### d. The frontend, on the server

```bash
curl -sI localhost:3000 | head -1        # HTTP/1.1 200 OK
```

---

## 6. Reach it from a browser

Nothing else is required. The frontend container publishes `3000`, and it talks
to the backend over the compose network, so there is no proxy to configure.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 3000/tcp
sudo ufw enable
sudo ufw status
```

Open `http://SERVER_IP:3000`, go to **Documents**, add the smoke-test text from
§5c, then ask about it on the **Ask** page.

If the page loads but nothing responds to a click, open the browser console —
a client-side exception aborts hydration and the trace names the cause. It is
never a silent failure.

> `CORS_ORIGINS` and `NEXT_PUBLIC_APP_URL` must both be exactly
> `http://SERVER_IP:3000` — scheme, host **and** port. If you edit them, run
> `make prod` again; `NEXT_PUBLIC_*` is baked into the frontend at build time.

### Optional: serve it on port 80 instead

Only worth doing if typing `:3000` annoys you, or you want basic auth in front
(§9). Still plain HTTP.

```bash
sudo apt update && sudo apt install -y nginx

sudo tee /etc/nginx/sites-available/rag >/dev/null <<'EOF'
server {
    listen 80;
    server_name _;

    # Must be >= MAX_UPLOAD_MB, or a large PDF is rejected at the proxy with a
    # 413 before the app ever sees it.
    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Next.js compares Origin against the forwarded host to authorise
        # Server Actions. Get these wrong and form submissions fail with no
        # visible error in the browser.
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;

        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # The chat answer is server-sent events. Buffering here makes a streaming
    # answer arrive all at once at the end instead of token by token.
    location /api/chat/stream {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 600s;
        chunked_transfer_encoding off;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/rag /etc/nginx/sites-enabled/rag
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo ufw allow 'Nginx HTTP'
sudo ufw delete allow 3000/tcp        # 3000 no longer needs to be public
```

Then set both origin variables to `http://SERVER_IP` (no port) and `make prod`.

---

## 7. Operating it

```bash
make logs-prod      # tail both services
make down-prod      # stop
make prod           # (re)build and start

# one service only
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build backend
docker compose -f docker-compose.prod.yml --env-file .env.production restart frontend
```

**Deploy a change:**

```bash
cd rag-deploy && git pull && make prod
```

Migrations run on boot. Tell users to hard-reload (Ctrl/Cmd-Shift-R) — the
browser caches the previous build's JS chunks.

**Add a model** — no redeploy, no restart:

```bash
ollama pull mistral:7b
```

It shows up in the picker on the next page load.

**Change `EMBEDDING_DIM`.** The `vector(N)` column no longer fits, and vectors
from a different model are not comparable to the stored ones, so everything must
be re-embedded regardless. On a throwaway database:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm backend \
  alembic downgrade base
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm backend \
  alembic upgrade head
```

On a database you care about, write a real migration instead.

**Back up.** Everything the app owns is in `documents` and `chunks`:

```bash
docker exec pgvector pg_dump -U rag -d rag | gzip > "rag-$(date +%F).sql.gz"
```

Chunks are reproducible from the documents, so dumping `documents` alone and
re-ingesting is also valid if dump size matters.

---

## 8. When something is wrong

| Symptom                                       | Where to look                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Compose exits immediately with `set DATABASE_URL…` | A required variable is unset in `.env.production`. Compose fails loudly on purpose     |
| Backend restart-loops, `alembic` traceback ending `Connect call failed ('127.0.0.1', 5433)` | `DATABASE_URL` is still the template default. `localhost`→`host.docker.internal`, `5433`→the port your Postgres publishes |
| `database.reachable: false`                   | Right host and port, so: wrong password, or the `rag` role / `rag` database was never created (§2) |
| `llm.reachable: false`                        | Ollama bound to loopback — §1. Test from inside the container, not from the host            |
| `embedding.dim_matches: false`                | `EMBEDDING_DIM` ≠ the model's real output size. 768 nomic-embed-text · 1024 mxbai / bge-m3 · 384 all-minilm |
| Model picker shows only one entry             | `/v1/models` could not be read. `curl` it from inside the backend container                 |
| Answer arrives all at once, not streaming     | `proxy_buffering off` missing on `/api/chat/stream` — §6                                    |
| Upload fails at ~1 MB, or 413                 | `client_max_body_size` below `MAX_UPLOAD_MB` — §6                                           |
| Forms submit but nothing happens              | `Host` / `X-Forwarded-Host` not forwarded, so Next rejects the Server Action — §6            |
| Every question answers "I could not find anything" | `MIN_SCORE` too high, or embedding task prefixes wrong. `DEPLOY.md` §5                  |
| UI renders but nothing is clickable           | Open the browser console. A client-side exception aborts hydration; the trace names the cause |

Logs, narrowed:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=100 backend
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=100 frontend
docker logs --tail=50 pgvector
sudo tail -50 /var/log/nginx/error.log
```

---

## 9. Before you expose it publicly

This was built as a testing app. Two things matter more than anything above:

- **There is no authentication.** Anyone who reaches the frontend can read,
  add and delete every document. Put it behind basic auth, an SSO proxy, or a
  private network.

  Requires the optional nginx from §6, since basic auth lives in the proxy:

  ```bash
  sudo apt install -y apache2-utils
  sudo htpasswd -c /etc/nginx/.htpasswd youruser
  # then inside `location / {`:
  #   auth_basic "RAG";
  #   auth_basic_user_file /etc/nginx/.htpasswd;
  sudo nginx -t && sudo systemctl reload nginx
  ```

  Over plain HTTP those credentials cross the network base64-encoded, not
  encrypted. That is fine on a LAN you trust; it is not a control that survives
  exposure to the internet, which is what Appendix A is for.

- **URL ingestion fetches any URL the caller gives it**, from inside your
  network — a server-side request forgery vector on an untrusted deployment.
  Restrict it, or drop the `/api/v1/documents/url` route.

Also absent by design: rate limiting, per-user document scoping, upload
scanning. See `README.md`.

---

## Tightening the database (optional)

Your pgvector container publishes `0.0.0.0:5432`, which makes the database
reachable from anything that can route to the host. Binding it to `127.0.0.1`
would *not* fix this — it would break the backend container, which arrives via
the Docker bridge, not loopback.

The clean fix is to stop publishing the port at all and put the container on the
app's network:

Compose names the network `<directory>_default`, so read it rather than assume
it — a clone into `rag-application/` gives `rag-application_default`:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["networks"]["default"]["name"])'

docker network connect <that-name> pgvector

# then in .env.production — the container name resolves on the shared network:
#   DATABASE_URL=postgresql+asyncpg://rag:STRONG_PASSWORD@pgvector:5432/rag
make prod
```

Re-create the container without `-p 5432:5432` once that works. The volume keeps
your data across the replacement.

---

## Appendix A — adding HTTPS later

When you have a domain pointed at the server, this is the whole change.

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
# use the nginx server block from §6, with server_name rag.example.com;
sudo certbot --nginx -d rag.example.com -m you@example.com --agree-tos --redirect
sudo certbot renew --dry-run

sudo ufw allow 'Nginx Full'
sudo ufw delete allow 3000/tcp
```

Then update both origin variables and rebuild — `NEXT_PUBLIC_APP_URL` is
compiled into the frontend bundle, so a restart alone will not pick it up:

```ini
CORS_ORIGINS=https://rag.example.com
NEXT_PUBLIC_APP_URL=https://rag.example.com
```

```bash
make prod
```

Worth knowing: browsers only grant secure-context APIs (`crypto.randomUUID`,
`navigator.clipboard`, service workers) to HTTPS origins and to `localhost`.
This app does not depend on any of them, which is why plain HTTP on an IP works
— but anything you add later might, and the failure mode is a handler that
throws on click rather than a visible error.
