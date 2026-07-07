#!/bin/sh
set -e

if [ -n "$S3_ENDPOINT" ] && { [ -z "$PARSE_SERVER_FILES_ADAPTER" ] || [ "$PARSE_SERVER_FILES_ADAPTER" = "@parse/s3-files-adapter" ]; }; then
  PARSE_SERVER_FILES_ADAPTER="$(node -e '
    const o = {
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION || "us-east-1",
      s3overrides: {
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || "true") !== "false"
      }
    };
    const ak = process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY;
    const sk = process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY;
    if (ak && sk) o.s3overrides.credentials = { accessKeyId: ak, secretAccessKey: sk };
    if (process.env.S3_DIRECT_ACCESS === "true") o.directAccess = true;
    if (process.env.S3_BASE_URL) o.baseUrl = process.env.S3_BASE_URL;
    if (process.env.S3_BUCKET_PREFIX) o.bucketPrefix = process.env.S3_BUCKET_PREFIX;
    process.stdout.write(JSON.stringify({ module: "@parse/s3-files-adapter", options: o }));
  ')"
  export PARSE_SERVER_FILES_ADAPTER
fi

exec node ./bin/parse-server "$@"
