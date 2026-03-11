#!/bin/sh
set -eu

DB_WAIT_HOST="${DB_WAIT_HOST:-postgres:5432}"

echo "⏳ Aguardando PostgreSQL em ${DB_WAIT_HOST}..."
/wait-for.sh "${DB_WAIT_HOST}"

echo "🗄️ Rodando migrations..."
node db/migrate.js

echo "🚀 Iniciando backend..."
exec npm start
