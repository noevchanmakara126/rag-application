#!/usr/bin/env bash
# Schema first, server second: the app assumes `documents`, `chunks` and the
# vector extension already exist.
set -euo pipefail

echo "→ applying migrations"
alembic upgrade head

exec "$@"
