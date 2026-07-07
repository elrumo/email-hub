#!/bin/bash
# Wrapper around the official mongo image entrypoint that reconciles the root
# user's credentials with the current environment on EVERY boot.
#
# Why: the mongo image only creates MONGO_INITDB_ROOT_USERNAME/PASSWORD when
# the data volume is empty (first init). If the volume was initialized under an
# older credential scheme — or MONGO_PASSWORD changed between deploys — mongod
# keeps the old credentials and parse-server fails with "Authentication
# failed" forever. This script heals that: on an existing volume it briefly
# starts a maintenance mongod (localhost only, no auth), creates or updates the
# root user to match the env, shuts it down, then hands off to the normal
# entrypoint.
set -e

: "${MONGO_INITDB_ROOT_USERNAME:?MONGO_INITDB_ROOT_USERNAME is required}"
: "${MONGO_INITDB_ROOT_PASSWORD:?MONGO_INITDB_ROOT_PASSWORD is required}"

DBPATH=/data/db
MAINT_PORT=27099

if [ -s "$DBPATH/WiredTiger" ]; then
  echo "[mongo-entrypoint] existing data volume — reconciling root credentials"
  # Run the maintenance mongod as the mongodb user so no root-owned files are
  # left behind in the data dir.
  gosu mongodb mongod --dbpath "$DBPATH" --bind_ip 127.0.0.1 --port "$MAINT_PORT" \
    --fork --logpath /tmp/mongo-maint.log

  for _ in $(seq 1 60); do
    mongosh --port "$MAINT_PORT" --quiet --eval "db.adminCommand('ping')" > /dev/null 2>&1 && break
    sleep 1
  done

  # Credentials come from process.env inside mongosh — no shell interpolation,
  # so special characters in the password are safe here.
  mongosh --port "$MAINT_PORT" --quiet admin --eval '
    const user = process.env.MONGO_INITDB_ROOT_USERNAME;
    const pwd = process.env.MONGO_INITDB_ROOT_PASSWORD;
    if (db.getUser(user)) {
      db.changeUserPassword(user, pwd);
      print("[mongo-entrypoint] updated password for " + user);
    } else {
      db.createUser({ user, pwd, roles: [{ role: "root", db: "admin" }] });
      print("[mongo-entrypoint] created root user " + user);
    }
  '

  gosu mongodb mongod --dbpath "$DBPATH" --port "$MAINT_PORT" --shutdown
fi

exec docker-entrypoint.sh "$@"
