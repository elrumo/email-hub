#!/bin/sh
set -e

SECRETS="/run/secrets/mongo.env"
mkdir -p "$(dirname "$SECRETS")"

if [ ! -f "$SECRETS" ]; then
  _rand() { head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c "$1"; }
  PASS=$(_rand 32)
  cat > "$SECRETS" <<EOF
MONGO_USER=emailhub
MONGO_PASSWORD=${PASS}
MONGO_DB=parse
EOF
  chmod 600 "$SECRETS"
fi

. "$SECRETS"

export MONGO_INITDB_ROOT_USERNAME="$MONGO_USER"
export MONGO_INITDB_ROOT_PASSWORD="$MONGO_PASSWORD"
export MONGO_INITDB_DATABASE="$MONGO_DB"

exec docker-entrypoint.sh mongod --bind_ip 0.0.0.0
