#!/usr/bin/env bash
# ContaGamer — inicialização (SQLite embutido + app)
# Banco em arquivo (/data/contagamer.db): sem processo extra, sem falha de boot.
set -u
exec > >(tee -a /tmp/start.log) 2>&1

log() { echo "[start] $*"; }

export SQLITE_PATH="${SQLITE_PATH:-/data/contagamer.db}"
mkdir -p "$(dirname "$SQLITE_PATH")"

log "Preparando banco SQLite em ${SQLITE_PATH}..."

# Seed idempotente: só popula se o banco estiver vazio; sempre garante o admin
if npx tsx db/seed.ts --ensure; then
  log "Banco pronto."
else
  log "Seed falhou na primeira tentativa — recriando o arquivo do banco..."
  rm -f "$SQLITE_PATH" "$SQLITE_PATH-wal" "$SQLITE_PATH-shm"
  npx tsx db/seed.ts --ensure || log "FALHA definitiva no seed."
fi

log "Iniciando ContaGamer na porta ${PORT:-3000}..."
exec npm start
