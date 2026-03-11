#!/bin/sh
set -eu

HOST="$1"
shift || true

HOST_NAME="${HOST%:*}"
HOST_PORT="${HOST#*:}"

echo "⏳ Aguardando o serviço ${HOST_NAME}:${HOST_PORT} ficar disponível..."

until nc -z "$HOST_NAME" "$HOST_PORT"; do
  sleep 1
done

echo "✅ ${HOST_NAME}:${HOST_PORT} está pronto."

if [ "$#" -gt 0 ]; then
  exec "$@"
fi
