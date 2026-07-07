#!/bin/sh
set -e

SECRETS="/run/secrets/mongo.env"
if [ -f "$SECRETS" ]; then
  . "$SECRETS"
  export PARSE_SERVER_DATABASE_URI="mongodb://${MONGO_USER}:${MONGO_PASSWORD}@mongo:27017/${MONGO_DB}?authSource=admin"
fi

exec node /parse-server/bin/parse-server "$@"
